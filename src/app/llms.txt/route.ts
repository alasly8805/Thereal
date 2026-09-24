import { LLMS_TXT } from "@/lib/geo-phrases";

export const dynamic = "force-static";

export async function GET() {
  return new Response(LLMS_TXT, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
