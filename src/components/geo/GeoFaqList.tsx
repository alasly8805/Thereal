import type { GeoFaq } from "@/lib/geo-faqs";

export function GeoFaqList({
  items,
  theme = "dark",
}: {
  items: GeoFaq[];
  theme?: "dark" | "light";
}) {
  const box =
    theme === "dark"
      ? "bg-[var(--surface,#131b2e)] border-[var(--border,rgba(255,255,255,0.08))] text-[var(--ink,#fff)]"
      : "bg-white border-gray-200 text-gray-900 dark:bg-gray-900 dark:border-gray-800 dark:text-white";
  const answer =
    theme === "dark"
      ? "text-[var(--ink-muted,#8f9bb3)]"
      : "text-gray-600 dark:text-gray-300";

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <details
          key={item.q}
          className={`p-5 rounded-2xl border group ${box}`}
        >
          <summary className="font-bold text-sm sm:text-base cursor-pointer list-none flex items-center justify-between gap-3">
            <span>{item.q}</span>
            <span className="text-emerald-400 font-mono text-lg shrink-0">+</span>
          </summary>
          <p className={`mt-3 text-xs sm:text-sm leading-relaxed ${answer}`} data-geo-quote>
            {item.a}
          </p>
        </details>
      ))}
    </div>
  );
}
