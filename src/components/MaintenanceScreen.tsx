/**
 * Friendly "we're upgrading" screen shown to the public while maintenance mode
 * is on. Deliberately upbeat — it should read as "something good is coming",
 * not "the site is broken". Server component, CSS-only motion.
 */
export function MaintenanceScreen({ message }: { message: string }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#0b0f19] px-6 text-center">
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-sky-500/20 blur-[120px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-0 right-0 h-[24rem] w-[24rem] translate-x-1/3 translate-y-1/3 rounded-full bg-indigo-500/10 blur-[120px]"
        aria-hidden
      />

      <div className="relative z-10 flex w-full max-w-lg flex-col items-center">
        {/* Logo mark */}
        <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-3xl bg-sky-500 shadow-[0_0_50px_-8px_rgba(56,189,248,0.8)]">
          <span className="text-4xl font-black text-white">C</span>
        </div>

        <p className="mb-3 text-sm font-bold uppercase tracking-[0.3em] text-sky-400">Code-UP System</p>

        <h1 className="text-balance text-3xl font-black leading-tight text-white sm:text-4xl">
          إعادة تشغيل دورية مجدولة 🔄
        </h1>

        <p className="mt-4 max-w-md text-pretty text-base leading-relaxed text-white/80">
          {message || "المنصة تقوم الآن بإعادة تشغيل دورية سريعة لتحديث موارد السيرفر، يستغرق الأمر 60 ثانية فقط."}
        </p>

        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-4 py-1.5 text-xs font-bold text-sky-400">
          <span>⏱️ الوقت المقدر: دقيقة واحدة فقط</span>
        </div>

        {/* Indeterminate progress shimmer */}
        <div className="mt-8 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-white/10">
          <div className="maintenance-shimmer h-full w-1/3 rounded-full bg-gradient-to-r from-sky-400 to-indigo-400" />
        </div>

        <p className="mt-6 text-xs text-white/40">
          سيعاد تحميل الصفحة تلقائياً فور عودة السيرفر للعمل...
        </p>

        {/* Auto-reload every 10 seconds */}
        <script dangerouslySetInnerHTML={{ __html: "setTimeout(function(){ window.location.reload(); }, 10000);" }} />
      </div>
    </div>
  );
}
