import { FACTUAL_GLOSSARY } from "@/lib/geo-phrases";

export const dynamic = "force-static";

export async function GET() {
  const body = [
    "# Code-UP glossary for crawlers",
    "# This file used to generate millions of keyword sentences. That pattern is spam.",
    "# Use /llms.txt and /llms-full.txt for the canonical entity card.",
    "",
    ...FACTUAL_GLOSSARY,
    "",
    "https://code-up.tech",
    "https://code-up.tech/about",
    "https://code-up.tech/qureo",
    "https://code-up.tech/llms.txt",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
