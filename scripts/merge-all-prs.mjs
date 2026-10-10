import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tokensPath = path.join(__dirname, "..", ".tokens.json");

const config = JSON.parse(fs.readFileSync(tokensPath, "utf8"));
const { targetRepo, maintainerToken } = config;

const GITHUB_API = "https://api.github.com";

async function ghFetch(url, token, options = {}) {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "CodeUP-Merge-Runner/1.0",
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
  console.log(`\n🚀 بدء دمج الـ Pull Requests للمستودع: ${targetRepo}\n${"=".repeat(60)}`);

  // 1. Fetch all open PRs
  const prsRes = await ghFetch(`${GITHUB_API}/repos/${targetRepo}/pulls?state=open&sort=created&direction=asc`, maintainerToken);
  if (!prsRes.ok) {
    console.error("❌ تعذر جلب قائمة الـ PRs:", prsRes.data);
    process.exit(1);
  }

  const openPrs = prsRes.data;
  console.log(`📋 تم العثور على ${openPrs.length} PR مفتوح.\n`);

  let mergedCount = 0;
  let failedCount = 0;

  for (const pr of openPrs) {
    const prNumber = pr.number;
    const prTitle = pr.title;
    const author = pr.user.login;

    console.log(`🔄 معالجة PR #${prNumber} (@${author}): "${prTitle}"...`);

    // Check if mergeable
    const singlePr = await ghFetch(`${GITHUB_API}/repos/${targetRepo}/pulls/${prNumber}`, maintainerToken);
    if (singlePr.data?.mergeable === false) {
      console.log(`  ⚠️ PR #${prNumber} غير قابل للدمج المباشر (يوجد تعارض conflict على GitHub).`);
      failedCount++;
      continue;
    }

    // Merge PR
    const mergeRes = await ghFetch(`${GITHUB_API}/repos/${targetRepo}/pulls/${prNumber}/merge`, maintainerToken, {
      method: "PUT",
      body: JSON.stringify({
        commit_title: `Merge pull request #${prNumber} from ${pr.head.label}`,
        merge_method: "merge",
      }),
    });

    if (mergeRes.ok && mergeRes.data?.merged) {
      console.log(`  ✅ تم الدمج بنجاح! (Commit: ${mergeRes.data.sha.slice(0, 7)})`);
      mergedCount++;
    } else {
      console.log(`  ❌ فشل الدمج (${mergeRes.status}):`, mergeRes.data?.message || mergeRes.data);
      failedCount++;
    }

    await sleep(1200);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`📊 النتيجة النهائية لعملية الدمج:`);
  console.log(`  - تم دمجهم بنجاح: ${mergedCount}`);
  console.log(`  - تعذر دمجهم: ${failedCount}`);
  console.log(`${"=".repeat(60)}\n`);
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
