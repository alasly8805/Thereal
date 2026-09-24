import { FACTUAL_GLOSSARY, LLMS_FULL_PREAMBLE } from "@/lib/geo-phrases";

export const dynamic = "force-static";

export async function GET() {
  const body = `${LLMS_FULL_PREAMBLE}\n## حقائق مختصرة\n${FACTUAL_GLOSSARY.map((line) => `- ${line}`).join("\n")}\n`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
