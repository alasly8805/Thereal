#!/usr/bin/env node
/**
 * Server Diagnostics & Security Audit CLI
 * Run live checks on server errors, production crashes, and security vulnerabilities.
 * Usage:
 *   server-check              (runs full diagnostics)
 *   server-check --errors     (live runtime errors & crash logs)
 *   server-check --security   (100-point codebase vulnerability scanner)
 *   server-check --tests      (runs 39 security regression tests)
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const APP_DIR = "/home/ec2-user/Thefake";
const PM2_LOG_DIR = "/home/ec2-user/.pm2/logs";

const CYAN = "\x1b[96m";
const GREEN = "\x1b[92m";
const YELLOW = "\x1b[93m";
const RED = "\x1b[91m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

const args = process.argv.slice(2);
const showAll = args.length === 0 || args.includes("--all");
const checkErrors = showAll || args.includes("--errors");
const checkSecurity = showAll || args.includes("--security");
const runTests = args.includes("--tests");

console.log(`${CYAN}╔════════════════════════════════════════════════════════════════════════╗${RESET}`);
console.log(`${CYAN}║${RESET} ${BOLD}🛡️  SERVER AUDIT & PRODUCTION ERROR DIAGNOSTICS${RESET}                        ${CYAN}║${RESET}`);
console.log(`${CYAN}║${RESET} ${DIM}Target: ${APP_DIR}${RESET}                                       ${CYAN}║${RESET}`);
console.log(`${CYAN}╚════════════════════════════════════════════════════════════════════════╝${RESET}\n`);

// ─────────────────────────────────────────────────────────────────────────────
// 1. RUNTIME & PRODUCTION ERRORS
// ─────────────────────────────────────────────────────────────────────────────
if (checkErrors) {
  console.log(`${BOLD}${YELLOW}── [1/3] LIVE PRODUCTION RUNTIME ERRORS ──${RESET}\n`);

  // A. Check PM2 status
  try {
    const pm2Status = execSync("pm2 jlist", { encoding: "utf-8" });
    const apps = JSON.parse(pm2Status);
    console.log(`${BOLD}PM2 Process Status:${RESET}`);
    for (const app of apps) {
      const statusColor = app.pm2_env.status === "online" ? GREEN : RED;
      console.log(`  • App: ${BOLD}${app.name}${RESET} (id: ${app.pm_id}) ➔ ${statusColor}${app.pm2_env.status.toUpperCase()}${RESET} | Restarts: ${app.pm2_env.restart_time} | Memory: ${(app.monit.memory / (1024 * 1024)).toFixed(1)} MB | CPU: ${app.monit.cpu}%`);
    }
  } catch (e) {
    console.log(`  ${RED}• PM2 is not running or unreachable.${RESET}`);
  }

  // B. Check recent PM2 error logs
  console.log(`\n${BOLD}Recent Server Error Logs (Last 24h):${RESET}`);
  try {
    const errorLogs = fs.readdirSync(PM2_LOG_DIR).filter(f => f.includes("error") && f.endsWith(".log"));
    let foundErrors = false;
    for (const logFile of errorLogs) {
      const fullPath = path.join(PM2_LOG_DIR, logFile);
      const content = fs.readFileSync(fullPath, "utf-8").trim();
      if (content) {
        foundErrors = true;
        const recentLines = content.split("\n").slice(-8);
        console.log(`  ${RED}From ${logFile}:${RESET}`);
        for (const line of recentLines) {
          console.log(`    ${DIM}${line}${RESET}`);
        }
      }
    }
    if (!foundErrors) {
      console.log(`  ${GREEN}✓ No recent errors in PM2 log files.${RESET}`);
    }
  } catch (e) {
    console.log(`  ${DIM}Could not read PM2 logs: ${e.message}${RESET}`);
  }

  // C. Query ClientError table for browser crashes
  console.log(`\n${BOLD}Recent Client-Reported Crashes (from Database):${RESET}`);
  try {
    const dbErrorsOut = execSync(
      `npx tsx scripts/check-reported-errors.ts`,
      { cwd: APP_DIR, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }
    );
    const lines = dbErrorsOut.split("\n").filter(l => l.includes("message:") || l.includes("url:") || l.includes("createdAt:"));
    if (lines.length > 0) {
      console.log(`  ${RED}Latest client crashes:${RESET}`);
      for (const l of lines.slice(0, 10)) {
        console.log(`    ${l.trim()}`);
      }
    } else {
      console.log(`  ${GREEN}✓ No client crashes reported in database.${RESET}`);
    }
  } catch (e) {
    console.log(`  ${DIM}Database error check skipped.${RESET}`);
  }
  console.log("");
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. CODEBASE VULNERABILITY SCANNER (100-POINT AUDIT ENGINE)
// ─────────────────────────────────────────────────────────────────────────────
if (checkSecurity) {
  console.log(`${BOLD}${YELLOW}── [2/3] CODEBASE VULNERABILITY & EXPLOIT AUDIT ──${RESET}\n`);

  try {
    const scanOut = execSync(`python3 scratch/collect_100_bugs.py`, { cwd: APP_DIR, encoding: "utf-8" });
    const findingsPath = path.join(APP_DIR, "scratch/findings_100.json");
    if (fs.existsSync(findingsPath)) {
      const findings = JSON.parse(fs.readFileSync(findingsPath, "utf-8"));
      
      const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0 };
      for (const f of findings) {
        counts[f.severity] = (counts[f.severity] || 0) + 1;
      }

      console.log(`${BOLD}Audit Summary:${RESET}`);
      console.log(`  • Total Findings:  ${BOLD}${findings.length}${RESET}`);
      console.log(`  • 🔴 Critical:      ${RED}${counts.CRITICAL || 0}${RESET}`);
      console.log(`  • 🟠 High:          ${YELLOW}${counts.HIGH || 0}${RESET}`);
      console.log(`  • 🟡 Medium:        ${CYAN}${counts.MEDIUM || 0}${RESET}`);

      console.log(`\n${BOLD}Top Critical & High Risk Vulnerabilities:${RESET}`);
      const topFindings = findings.filter(f => f.severity === "CRITICAL" || f.severity === "HIGH").slice(0, 5);
      for (const tf of topFindings) {
        const badge = tf.severity === "CRITICAL" ? `${RED}[CRITICAL]${RESET}` : `${YELLOW}[HIGH]${RESET}`;
        console.log(`  ${badge} ${BOLD}${tf.title}${RESET}`);
        console.log(`     Location: ${tf.file}:${tf.line}`);
        console.log(`     Risk:     ${DIM}${tf.description}${RESET}`);
        console.log(`     Fix:      ${GREEN}${tf.remediation}${RESET}\n`);
      }
      console.log(`  ${DIM}Full 100-vulnerability catalog: ${APP_DIR}/scratch/findings_100.json${RESET}\n`);
    }
  } catch (e) {
    console.log(`  ${RED}Security scan error: ${e.message}${RESET}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. SECURITY REGRESSION TESTS
// ─────────────────────────────────────────────────────────────────────────────
if (runTests || showAll) {
  console.log(`${BOLD}${YELLOW}── [3/3] SECURITY INVARIANT REGRESSION TEST SUITE ──${RESET}\n`);
  try {
    console.log(`${DIM}Running 39 automated security regression tests...${RESET}`);
    const testOut = execSync(`npm run test:security`, { cwd: APP_DIR, encoding: "utf-8" });
    const passedMatch = testOut.match(/(\d+\/\d+\s+security tests passed)/);
    if (passedMatch) {
      console.log(`  ${GREEN}${BOLD}✓ ${passedMatch[1]}${RESET}`);
    } else {
      console.log(testOut.split("\n").slice(-5).join("\n"));
    }
  } catch (e) {
    console.log(`  ${RED}Tests failed or exited with errors:${RESET}`);
    console.log(e.stdout ? e.stdout.slice(-500) : e.message);
  }
  console.log("");
}

console.log(`${CYAN}────────────────────────────────────────────────────────────────────────${RESET}`);
console.log(`${BOLD}Audit complete.${RESET} To inspect specific files or generate patches, use: ${CYAN}qwen -f <path/to/file> "audit and patch"${RESET}\n`);
