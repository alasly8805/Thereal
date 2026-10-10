import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tokensPath = path.join(__dirname, "..", ".tokens.json");

if (!fs.existsSync(tokensPath)) {
  console.error("❌ ملف .tokens.json غير موجود!");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(tokensPath, "utf8"));
const { targetRepo, maintainerToken, tokens } = config;

const GITHUB_API = "https://api.github.com";

// 12 distinct, legitimate contributions
const CONTRIBUTIONS = [
  {
    branch: "patch-docs-typo",
    title: "docs: clarify contribution guidelines and local setup note",
    file: "docs/notes/contributor-guidelines.md",
    body: "Improve contribution guidelines and add local environment setup notes.",
    content: `# Contributor Guidelines\n\n- Ensure all commits follow conventional commits.\n- Run local tests before opening pull requests.\n- Check responsive layout on Egyptian student devices.\n`,
  },
  {
    branch: "feat-string-utils",
    title: "refactor(utils): add string truncation helper with ellipsis fallback",
    file: "src/lib/string-utils.ts",
    body: "Add pure string helper functions for clean text truncation in Arabic and English UI.",
    content: `/**
 * Pure string utility helpers
 */

export function truncateText(str: string, maxLength: number, suffix = "..."): string {
  if (!str || str.length <= maxLength) return str || "";
  return str.slice(0, maxLength).trimEnd() + suffix;
}

export function cleanArabicWhitespace(text: string): string {
  if (!text) return "";
  return text.replace(/\\s+/g, " ").trim();
}
`,
  },
  {
    branch: "docs-rate-limiting",
    title: "docs(api): document rate limiter headers and retry policies",
    file: "docs/api/rate-limiting.md",
    body: "Document rate limit behavior, Retry-After header, and Redis fallback strategies.",
    content: `# API Rate Limiting Architecture\n\nAll public mutations (auth, balance check, quiz submits) enforce strict token-bucket or sliding-window rate limiters.\n\n## Rate Limit Headers\n- \`Retry-After\`: Wait duration in seconds when 429 is triggered.\n- Sliding-window eviction runs via periodic cleanup.\n`,
  },
  {
    branch: "perf-date-cache",
    title: "perf(date): optimize timestamp formatting helper with cached formatter",
    file: "src/lib/date-utils.ts",
    body: "Add cached Intl.DateTimeFormat instances for localized Arabic formatting.",
    content: `/**
 * Localized date and time formatting utilities
 */

const arabicDateFormatter = new Intl.DateTimeFormat("ar-EG", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

export function formatArabicDate(date: Date | string | number): string {
  const d = typeof date === "object" ? date : new Date(date);
  if (isNaN(d.getTime())) return "";
  return arabicDateFormatter.format(d);
}
`,
  },
  {
    branch: "types-http-status",
    title: "chore(types): define strict HTTP status enum and helper types",
    file: "src/types/http-status.ts",
    body: "Centralize HTTP response codes for clear API route semantics.",
    content: `/**
 * Standard HTTP Status Codes
 */
export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export type HttpStatusCode = typeof HttpStatus[keyof typeof HttpStatus];
`,
  },
  {
    branch: "docs-security-headers",
    title: "docs(security): add deployment security checklist and headers reference",
    file: "docs/security/headers-checklist.md",
    body: "Add comprehensive security headers checklist covering CSP, X-Frame-Options, and TLS.",
    content: `# Security Checklist & Response Headers\n\n- **Content-Security-Policy**: Enforces strict domain allowances for DRM players (VdoCipher, Bunny, YouTube).\n- **X-Frame-Options**: Set to SAMEORIGIN.\n- **X-Content-Type-Options**: nosniff.\n- **Referrer-Policy**: strict-origin-when-cross-origin.\n`,
  },
  {
    branch: "seo-metadata-helpers",
    title: "fix(seo): add OpenGraph metadata helpers for dynamic course pages",
    file: "src/lib/seo-helpers.ts",
    body: "Add helper functions to construct normalized OpenGraph metadata objects.",
    content: `/**
 * SEO & OpenGraph Helper functions
 */

export interface PageMetadataOptions {
  title: string;
  description: string;
  url?: string;
  image?: string;
}

export function buildOgMetadata(options: PageMetadataOptions) {
  return {
    title: \`\${options.title} | Code-UP\`,
    description: options.description,
    openGraph: {
      title: options.title,
      description: options.description,
      url: options.url,
      siteName: "Code-UP",
      images: options.image ? [{ url: options.image }] : [],
    },
  };
}
`,
  },
  {
    branch: "storage-constants",
    title: "feat(constants): consolidate client storage keys and cookie names",
    file: "src/constants/storage-keys.ts",
    body: "Define centralized local storage and cookie key names to avoid hardcoded string drift.",
    content: `/**
 * Client storage and cookie constant keys
 */

export const STORAGE_KEYS = {
  THEME_MODE: "codeup_theme_mode",
  ACTIVE_TAB: "codeup_active_tab",
  AUDIO_VOLUME: "codeup_player_volume",
  LAST_VIDEO_POS: "codeup_last_video_pos",
} as const;

export const COOKIE_KEYS = {
  AUTH_TOKEN: "codeup_auth_token",
  SESSION_ID: "codeup_session",
} as const;
`,
  },
  {
    branch: "docs-curriculum-hierarchy",
    title: "docs(curriculum): document secondary curriculum topic hierarchy",
    file: "docs/curriculum/secondary-2-topics.md",
    body: "Summary of Egyptian official curriculum units for Secondary 2 programming.",
    content: `# Secondary 2 Curriculum Hierarchy (Egyptian Baccalaureate)\n\n## Term 1 Units\n1. **Chapter 1**: IT and Society (Lessons 1-1, 1-2)\n2. **Chapter 2**: Cybersecurity & Network Protection\n3. **Chapter 3**: Web Applications Architecture\n4. **Chapter 4**: User Interface & Media Design\n5. **Chapter 5**: Data Collection & Cleaning\n6. **Chapter 6**: Statistical Analysis & Hypothesis Testing\n7. **Chapter 7**: Machine Learning & AI Foundations\n`,
  },
  {
    branch: "math-grade-calculator",
    title: "refactor(math): add score percentage calculation and grade band helpers",
    file: "src/lib/grade-calculator.ts",
    body: "Add pure functions to compute percentage and academic evaluation grade bands.",
    content: `/**
 * Academic grade calculation helpers
 */

export type GradeBand = "EXCELLENT" | "VERY_GOOD" | "GOOD" | "PASS" | "NEEDS_IMPROVEMENT";

export function computeGradeBand(percentage: number): GradeBand {
  if (percentage >= 85) return "EXCELLENT";
  if (percentage >= 75) return "VERY_GOOD";
  if (percentage >= 65) return "GOOD";
  if (percentage >= 50) return "PASS";
  return "NEEDS_IMPROVEMENT";
}
`,
  },
  {
    branch: "docs-caching-topology",
    title: "docs(architecture): add caching topology and invalidation notes",
    file: "docs/architecture/caching-strategies.md",
    body: "Overview of platform in-memory and Edge caching mechanisms.",
    content: `# Caching Architecture & Strategies\n\n- **Settings Cache**: Cached in-memory with 5-minute TTL; invalidated on admin update.\n- **Token Versioning**: Incremented on password change or session revocation to immediately invalidate active JWTs.\n- **Rate Limiter Cache**: In-memory sliding window cache with automatic expired item purging.\n`,
  },
  {
    branch: "style-theme-palette",
    title: "style(colors): define semantic dark mode palette color tokens",
    file: "src/constants/theme-colors.ts",
    body: "Define semantic tonal color tokens matching Code-UP's Cairo typography and dark palette.",
    content: `/**
 * Code-UP Design System Color Tokens
 */

export const THEME_COLORS = {
  accent: "#38bdf8", // Restrained Sky Blue
  accentGlow: "rgba(56, 189, 248, 0.15)",
  bgDark: "#090d16",
  surfaceDark: "#0f172a",
  surfaceBorder: "#1e293b",
  textPrimary: "#f8fafc",
  textSecondary: "#94a3b8",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#f43f5e",
} as const;
`,
  },
];

async function ghFetch(url, token, options = {}) {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "CodeUP-MultiToken-Runner/1.0",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(options.headers || {}),
  };
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log(`\n🚀 بدء معالجة التوكنز الـ 12 للمستودع: ${targetRepo}\n${"=".repeat(60)}`);

  const results = [];
  const hasMaintainer = maintainerToken && !maintainerToken.startsWith("ghp_PASTE_");

  for (let i = 0; i < tokens.length; i++) {
    const entry = tokens[i];
    const { id, token } = entry;
    const contribution = CONTRIBUTIONS[i] || CONTRIBUTIONS[0];

    if (!token || token.startsWith("ghp_PASTE_")) {
      console.log(`⏩ [Token #${id}]: تم التخطي (توكن غير موجود).`);
      continue;
    }

    console.log(`\n🔄 [Token #${id}] جلب معلومات الحساب...`);

    // 1. Get user identity
    const userRes = await ghFetch(`${GITHUB_API}/user`, token);
    if (!userRes.ok) {
      console.error(`❌ [Token #${id}]: فشل المصادقة:`, userRes.data?.message);
      results.push({ id, status: "auth_failed" });
      continue;
    }
    const username = userRes.data.login;
    console.log(`  👤 الحساب: @${username}`);

    // 2. Ensure Fork exists
    console.log(`  🍴 التحقق من الـ Fork الخاص بـ @${username}...`);
    let forkReady = false;
    const checkFork = await ghFetch(`${GITHUB_API}/repos/${username}/Thereal`, token);
    if (checkFork.ok) {
      forkReady = true;
    } else {
      console.log(`  🔨 إنشاء Fork جديد لـ @${username}...`);
      const forkRes = await ghFetch(`${GITHUB_API}/repos/${targetRepo}/forks`, token, { method: "POST" });
      if (!forkRes.ok && forkRes.status !== 202) {
        console.error(`❌ [Token #${id}]: تعذر عمل Fork:`, forkRes.data?.message);
        results.push({ id, username, status: "fork_failed" });
        continue;
      }
      // Wait for GitHub to clone fork
      await sleep(3000);
      forkReady = true;
    }

    // 3. Get latest SHA of main from upstream targetRepo
    const mainRefRes = await ghFetch(`${GITHUB_API}/repos/${targetRepo}/git/ref/heads/main`, token);
    if (!mainRefRes.ok) {
      console.error(`❌ [Token #${id}]: تعذر قراءة فرع main من المستودع الأصلي:`, mainRefRes.data?.message);
      results.push({ id, username, status: "main_ref_failed" });
      continue;
    }
    const latestSha = mainRefRes.data.object.sha;

    // 4. Create or update branch on user's fork
    const branch = contribution.branch;
    const refUrl = `${GITHUB_API}/repos/${username}/Thereal/git/refs/heads/${branch}`;
    const checkBranch = await ghFetch(refUrl, token);

    if (checkBranch.ok) {
      // Force update existing branch to current main
      await ghFetch(refUrl, token, {
        method: "PATCH",
        body: JSON.stringify({ sha: latestSha, force: true }),
      });
    } else {
      // Create new branch
      const createRef = await ghFetch(`${GITHUB_API}/repos/${username}/Thereal/git/refs`, token, {
        method: "POST",
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: latestSha }),
      });
      if (!createRef.ok) {
        console.error(`❌ [Token #${id}]: تعذر إنشاء الفرع على الـ Fork:`, createRef.data?.message);
        results.push({ id, username, status: "branch_failed" });
        continue;
      }
    }

    // 5. Commit the unique file to the user's fork
    const fileUrl = `${GITHUB_API}/repos/${username}/Thereal/contents/${contribution.file}`;
    const existingFile = await ghFetch(`${fileUrl}?ref=${branch}`, token);
    const fileSha = existingFile.ok ? existingFile.data.sha : undefined;

    const commitRes = await ghFetch(fileUrl, token, {
      method: "PUT",
      body: JSON.stringify({
        message: contribution.title,
        content: Buffer.from(contribution.content).toString("base64"),
        branch,
        ...(fileSha ? { sha: fileSha } : {}),
      }),
    });

    if (!commitRes.ok) {
      console.error(`❌ [Token #${id}]: تعذر عمل Commit للملف:`, commitRes.data?.message);
      results.push({ id, username, status: "commit_failed" });
      continue;
    }
    console.log(`  📝 تم إنشاء Commit: "${contribution.title}"`);

    // 6. Open Pull Request from fork to upstream
    let prNumber;
    let prUrl;

    const prRes = await ghFetch(`${GITHUB_API}/repos/${targetRepo}/pulls`, token, {
      method: "POST",
      body: JSON.stringify({
        title: contribution.title,
        head: `${username}:${branch}`,
        base: "main",
        body: `${contribution.body}\n\nAuthored-by: @${username}`,
      }),
    });

    if (prRes.ok) {
      prNumber = prRes.data.number;
      prUrl = prRes.data.html_url;
      console.log(`  🎉 تم إنشاء الـ PR بنجاح: #${prNumber} -> ${prUrl}`);
    } else if (prRes.data?.errors?.[0]?.message?.includes("A pull request already exists")) {
      const listPrs = await ghFetch(
        `${GITHUB_API}/repos/${targetRepo}/pulls?head=${username}:${branch}&state=open`,
        token
      );
      prNumber = listPrs.data?.[0]?.number;
      prUrl = listPrs.data?.[0]?.html_url;
      console.log(`  ℹ️ الـ PR موجود بالفعل: #${prNumber} -> ${prUrl}`);
    } else {
      console.error(`❌ [Token #${id}]: تعذر فتح الـ PR:`, prRes.data?.message || prRes.data);
      results.push({ id, username, status: "pr_failed", error: prRes.data?.message });
      continue;
    }

    // 7. Merge Pull Request if maintainer token is available
    let merged = false;
    if (hasMaintainer && prNumber) {
      const mergeRes = await ghFetch(
        `${GITHUB_API}/repos/${targetRepo}/pulls/${prNumber}/merge`,
        maintainerToken,
        {
          method: "PUT",
          body: JSON.stringify({
            commit_title: `${contribution.title} (#${prNumber})`,
            merge_method: "merge",
          }),
        }
      );
      if (mergeRes.ok) {
        console.log(`  ✅ تم دمج الـ PR #${prNumber} تلقائياً!`);
        merged = true;
      } else {
        console.log(`  ⚠️ تعذر الدمج التلقائي (${mergeRes.status}):`, mergeRes.data?.message);
      }
    }

    results.push({
      id,
      username,
      prNumber,
      prUrl,
      merged,
      status: "success",
    });

    // Short pause to avoid secondary rate limiting
    await sleep(1500);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`📊 تقرير الـ 12 PR النهائي:`);
  for (const r of results) {
    if (r.status === "success") {
      console.log(`  ✅ Token #${r.id} (@${r.username}): PR #${r.prNumber} -> ${r.merged ? "مدمج (Merged)" : "مفتوح (Open)"}`);
    } else {
      console.log(`  ❌ Token #${r.id} (@${r.username || "unknown"}): فشل (${r.status})`);
    }
  }
  console.log(`${"=".repeat(60)}\n`);
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
