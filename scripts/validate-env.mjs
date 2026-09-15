/**
 * Validates required environment variables for this project.
 * Run: node scripts/validate-env.mjs
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnvFile(filename) {
  const path = join(root, filename);
  if (!existsSync(path)) return {};
  const content = readFileSync(path, "utf8");
  const vars = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

const merged = {
  ...loadEnvFile(".env"),
  ...loadEnvFile(".env.local"),
  ...process.env,
};

const skipTwilioValidation = merged.TWILIO_BYPASS_VERIFICATION === "true";

const REQUIRED = [
  {
    key: "DATABASE_URL",
    test: (v) => {
      if (v.startsWith("file:") || v.startsWith("libsql:")) return true;
      return (
        (v.startsWith("postgresql://") || v.startsWith("postgres://")) &&
        !/YOUR_DB_PASSWORD|USER:PASSWORD|replace-me/i.test(v)
      );
    },
    hint: "Use file:./dev.db (local) or a real Supabase PostgreSQL URI",
  },
  {
    key: "JWT_SECRET",
    test: (v) => v.length >= 16 && !/replace-with|your-secret|change-me/i.test(v),
    hint: "At least 16 characters; not a placeholder",
  },
];

/**
 * OTP delivery needs at least one configured channel.
 *
 * sendVerificationCode() tries the Meta WhatsApp Cloud API and falls back to AWS
 * SNS. If neither is configured, both legs throw and /api/auth/signup and
 * /api/auth/forgot-password return 500 — no new accounts and no password
 * recovery. The Baileys QR client can also deliver, but it is interactively
 * paired and cannot be verified from the environment, so it does not count here.
 *
 * (Twilio is still present in the tree but is no longer in the send path, so it
 * is not checked — requiring it made this script fail on every healthy deploy.)
 */
function describeOtpChannels(env) {
  const meta = Boolean(env.WHATSAPP_PHONE_NUMBER_ID?.trim() && env.WHATSAPP_PERMANENT_TOKEN?.trim());
  const sns = Boolean(
    (env.AWS_ACCESS_KEY_ID?.trim() && env.AWS_SECRET_ACCESS_KEY?.trim()) || env.AWS_USE_INSTANCE_ROLE === "true"
  );
  return { meta, sns, any: meta || sns };
}

/**
 * Required only when deploying for real (NODE_ENV=production, or --production).
 *
 * Each of these fails *closed* at runtime, which is safe but silent: without the
 * webhook secrets both payment gateways reject every callback with a 500 and no
 * wallet top-up is ever credited automatically, and without CRON_SECRET the OTP
 * queue never drains. Those are the kind of outages that are only noticed via
 * customer complaints, so surface them at deploy time instead.
 */
const PRODUCTION_REQUIRED = [
  {
    key: "SHA7NAWY_WEBHOOK_SECRET",
    test: (v) => v.length >= 16 && !/replace-with|change-me/i.test(v),
    hint: "Shared secret configured in the Sha7nawy dashboard. Without it every webhook is rejected and top-ups are never credited.",
  },
  {
    key: "SHAKEOUT_WEBHOOK_SECRET",
    test: (v) => v.length >= 16 && !/replace-with|change-me/i.test(v),
    hint: "Shared secret configured in the Shake-Out dashboard. Without it every webhook is rejected and top-ups are never credited.",
  },
  {
    key: "CRON_SECRET",
    test: (v) => v.length >= 16 && v !== "codeup_secret_cron",
    hint: "Bearer secret for /api/cron/* . Must not be the old hardcoded 'codeup_secret_cron'. Generate: openssl rand -base64 24",
  },
  {
    key: "SUPPORT_PANEL_PASSWORD",
    // Without it the panel silently accepts only SUPERADMIN_MASTER_PASSWORD,
    // which reads as "my password stopped working" rather than as a config
    // error. It also gates password resets on student accounts, so a short or
    // placeholder value is a real exposure, not a cosmetic one.
    test: (v) => v.length >= 12 && !/replace-with|change-me|password/i.test(v),
    hint: "Password for /thefake/support. At least 12 characters, not a placeholder. Generate: openssl rand -base64 18",
  },
  {
    key: "ALASLY_API_KEY",
    test: (v) => v.length > 0 && v !== "alk_06a5ofogdqo11inzwoqn186jukk0bh7o",
    hint: "Native video API key. The previously committed key is published — rotate it and set the new one here.",
  },
  {
    key: "ALASLY_API_SECRET",
    test: (v) => v.length > 0 && v !== "als_ga4xg1zjs8h94ksv4rgbrc6yb4cjngf4pl0u7evxc106k7lq",
    hint: "Native video API secret. The previously committed secret is published — rotate it and set the new one here.",
  },
];

/** Settings that are unsafe rather than merely missing. */
const PRODUCTION_FORBIDDEN = [
  {
    key: "BYPASS_PHONE_VERIFICATION",
    bad: (v) => v === "true",
    why: "Disables the OTP requirement on password reset — anyone could reset any account by phone number alone.",
  },
  {
    key: "RECAPTCHA_BYPASS",
    bad: (v) => v === "true",
    why: "Disables bot protection on login, signup and OTP send.",
  },
  {
    key: "SECURE_COOKIES",
    bad: (v) => v === "false",
    why: "Sends the session cookie over plain HTTP.",
  },
];

const RECOMMENDED = [
  "NEXT_PUBLIC_SITE_URL",
];

let failed = 0;

console.log("Environment validation\n");

const envFiles = [".env", ".env.local"].filter((f) => existsSync(join(root, f)));
if (envFiles.length === 0) {
  console.error("No .env or .env.local file found.");
  console.error("Copy .env.example to .env and fill in your values.\n");
  process.exit(1);
}

console.log(`Loaded: ${envFiles.join(", ")}\n`);

for (const { key, test, hint } of REQUIRED) {
  const value = merged[key]?.trim() ?? "";
  if (!value) {
    console.error(`MISSING: ${key}`);
    console.error(`         ${hint}\n`);
    failed++;
    continue;
  }
  if (!test(value)) {
    console.error(`INVALID: ${key}`);
    console.error(`         ${hint}\n`);
    failed++;
    continue;
  }
  console.log(`OK: ${key}`);
}

// ── Production-only gate ─────────────────────────────────────────────────────
const isProduction =
  merged.NODE_ENV === "production" || process.argv.includes("--production");

if (isProduction) {
  console.log("\nProduction checks\n");

  for (const { key, test, hint } of PRODUCTION_REQUIRED) {
    const value = merged[key]?.trim() ?? "";
    if (!value) {
      console.error(`MISSING: ${key}`);
      console.error(`         ${hint}\n`);
      failed++;
      continue;
    }
    if (!test(value)) {
      console.error(`INVALID: ${key}`);
      console.error(`         ${hint}\n`);
      failed++;
      continue;
    }
    console.log(`OK: ${key}`);
  }

  const otp = describeOtpChannels(merged);
  if (!otp.any) {
    console.error("MISSING: OTP delivery channel");
    console.error(
      "         No WhatsApp Cloud API (WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_PERMANENT_TOKEN)"
    );
    console.error(
      "         and no AWS SNS (AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY, or AWS_USE_INSTANCE_ROLE=true)."
    );
    console.error(
      "         Signup and password reset will both fail with 500 — sendVerificationCode() has nothing to fall back to.\n"
    );
    failed++;
  } else {
    console.log(
      `OK: OTP delivery (${[otp.meta && "WhatsApp Cloud API", otp.sns && "AWS SNS"].filter(Boolean).join(" + ")})`
    );
    if (!otp.sns) {
      console.warn(
        "WARN: no SMS fallback configured — if the WhatsApp Cloud API errors, OTP delivery has nowhere to go."
      );
    }
  }

  for (const { key, bad, why } of PRODUCTION_FORBIDDEN) {
    const value = merged[key]?.trim() ?? "";
    if (value && bad(value)) {
      console.error(`UNSAFE:  ${key}=${value}`);
      console.error(`         ${why}\n`);
      failed++;
    }
  }
} else {
  console.log(
    "\nSkipping production checks (set NODE_ENV=production or pass --production to run them)."
  );
}

for (const key of RECOMMENDED) {
  const value = merged[key]?.trim() ?? "";
  if (!value) {
    console.warn(`WARN: ${key} is not set (optional but recommended)`);
  }
}

if (merged.DATABASE_URL?.includes("file:")) {
  const sqlitePath = merged.DATABASE_URL.replace(/^file:/, "");
  if (process.platform !== "win32" && /^[A-Za-z]:[\\/]/.test(sqlitePath)) {
    console.warn(
      "\nWARN: DATABASE_URL points to a Windows SQLite path on a non-Windows system. Use file:./prisma/dev.db instead."
    );
  } else {
    console.log("\nOK: DATABASE_URL is using SQLite for local development.");
  }
}

if (failed > 0) {
  console.error(`\n${failed} required variable(s) need fixing. See .env.example`);
  process.exit(1);
}

console.log("\nAll required environment variables look good.");
