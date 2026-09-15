import type { Metadata } from "next";
import { getSupportSession } from "@/lib/support-auth";
import SupportPanelClient from "./SupportPanelClient";

/**
 * The panel lives on an unguessable path rather than a linked one, so keep it
 * out of search engines and out of the sitemap.
 */
export const metadata: Metadata = {
  title: "لوحة الدعم الفني",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

type SearchParams = { error?: string; notice?: string };

export default async function SupportPanelPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const support = await getSupportSession();
  const { error, notice } = await searchParams;

  if (!support) {
    return <SupportLogin error={error} />;
  }

  return <SupportPanelClient notice={notice} error={error} />;
}

function SupportLogin({ error }: { error?: string }) {
  return (
    <main
      dir="rtl"
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10"
      style={{ background: "#0A0E1A" }}
    >
      {/* Ambient glows — same mission-control theme as the panel itself */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute -top-32 right-[-8%] h-[420px] w-[420px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(45,212,191,.16) 0%, transparent 65%)" }}
        />
        <div
          className="absolute bottom-[-12%] left-[-6%] h-[460px] w-[460px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(167,139,250,.13) 0%, transparent 65%)" }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(148,163,200,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,200,.05) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(ellipse 80% 60% at 50% 40%, black 30%, transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 40%, black 30%, transparent 75%)",
          }}
        />
      </div>

      <div
        className="relative w-full max-w-sm rounded-3xl border p-7 backdrop-blur-xl"
        style={{
          background: "rgba(148, 163, 200, 0.06)",
          borderColor: "rgba(148, 163, 200, 0.16)",
          boxShadow: "0 24px 80px rgba(2, 6, 18, 0.6)",
        }}
      >
        <div className="mb-6 text-center">
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-2xl"
            style={{
              background: "linear-gradient(135deg, #2DD4BF 0%, #22D3EE 100%)",
              boxShadow: "0 6px 24px rgba(45, 212, 191, 0.4)",
            }}
          >
            🛟
          </div>
          <h1
            className="text-xl font-black"
            style={{
              background: "linear-gradient(135deg, #2DD4BF 0%, #22D3EE 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            لوحة الدعم الفني
          </h1>
          <p className="mt-1 text-sm" style={{ color: "#9AA8C2" }}>
            الدخول بكلمة مرور الدعم فقط
          </p>
        </div>

        {error && (
          <div
            className="mb-4 rounded-xl border px-4 py-3 text-sm font-semibold"
            style={{
              borderColor: "rgba(251, 113, 133, 0.4)",
              background: "rgba(251, 113, 133, 0.1)",
              color: "#FB7185",
            }}
          >
            {error}
          </div>
        )}

        {/* Native form POST — no XHR, so Cloudflare does not challenge it. */}
        <form action="/thefake/support/login" method="POST" className="space-y-4">
          <div>
            <label
              htmlFor="support-password"
              className="mb-1.5 block text-sm font-bold"
              style={{ color: "#E8EEF9" }}
            >
              كلمة المرور
            </label>
            <input
              id="support-password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              dir="ltr"
              className="w-full rounded-xl border px-4 py-3 text-center outline-none transition-shadow focus:ring-2 focus:ring-[#2DD4BF]/40"
              style={{
                background: "rgba(10, 14, 26, 0.55)",
                borderColor: "rgba(148, 163, 200, 0.2)",
                color: "#E8EEF9",
              }}
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-xl px-4 py-3 font-bold transition-all hover:-translate-y-px hover:brightness-110"
            style={{
              background: "linear-gradient(135deg, #2DD4BF 0%, #22D3EE 100%)",
              color: "#05201C",
              boxShadow: "0 6px 24px rgba(45, 212, 191, 0.3)",
            }}
          >
            دخول
          </button>
        </form>

        <p className="mt-5 text-center text-xs" style={{ color: "#64748F" }}>
          كل إجراء في هذه اللوحة يُسجَّل في سجل النشاط
        </p>
      </div>
    </main>
  );
}
