import Link from "next/link";
import { BrandLogo } from "@/components/ui/BrandLogo";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer style={{ background: "#0A1521", color: "#9DB1C5", fontFamily: "var(--font-body)" }}>
      {/* Main grid — 2 cols on mobile, 4 on md+ */}
      <div className="max-w-[1320px] mx-auto px-5 sm:px-7 pt-10 sm:pt-14 pb-0
                      grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-10">

        {/* Brand — full-width on mobile */}
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-3 mb-4">
            <BrandLogo size={28} showText={true} showTagline={true} />
          </div>
          <p className="text-sm leading-relaxed max-w-[300px]" style={{ color: "#8295A8" }}>
            منصة كورسات مصرية لشرح البرمجة والذكاء الاصطناعي، مع أدوات متابعة ذكية لأولياء الأمور.
          </p>
        </div>

        {/* Platform */}
        <div>
          <h3 className="text-xs font-bold mb-4 tracking-wider" style={{ color: "#94A3B8" }}>المنصة</h3>
          <ul className="space-y-3">
            {[
              { href: "/about",       label: "عن المنصة" },
              { href: "/qureo",       label: "Code-UP وكيريو" },
              { href: "/teachers",    label: "المعلمون" },
              { href: "/curriculum",  label: "دليل المنهج والبرمجة" },
              { href: "/faq",         label: "الأسئلة الشائعة" },
              { href: "/courses",     label: "الكورسات" },
              { href: "/library",     label: "مكتبتي" },
              { href: "/environments", label: "بيئات التعلم" },
              { href: "/account",     label: "حسابي" },
              { href: "/payment-methods", label: "طرق الدفع" },
              { href: "/leaderboard", label: "لوحة الشرف" },
            ].map(({ href, label }) => (
              <li key={href}>
                <Link href={href} className="text-sm no-underline hover:text-white transition-colors" style={{ color: "#CBD5E1" }}>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Legal */}
        <div>
          <h3 className="text-xs font-bold mb-4 tracking-wider" style={{ color: "#94A3B8" }}>قانوني</h3>
          <ul className="space-y-3">
            <li>
              <Link href="/terms" className="text-sm no-underline hover:text-white transition-colors" style={{ color: "#CBD5E1" }}>
                الشروط والأحكام
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="text-sm no-underline hover:text-white transition-colors" style={{ color: "#CBD5E1" }}>
                سياسة الخصوصية
              </Link>
            </li>
          </ul>
        </div>

        {/* Contact */}
        <div>
          <h3 className="text-xs font-bold mb-4 tracking-wider" style={{ color: "#94A3B8" }}>تواصل</h3>
          <ul className="space-y-3">
            <li>
              <a href="https://wa.me/201118802621" target="_blank" rel="noopener noreferrer" className="text-sm no-underline hover:text-emerald-400 transition-colors flex items-center gap-1.5" style={{ color: "#CBD5E1" }}>
                <span>💬 واتساب:</span>
                <span dir="ltr" className="font-mono">01118802621</span>
              </a>
            </li>
            <li>
              <a href="mailto:contact@code-up.tech" className="text-sm no-underline hover:text-white transition-colors break-all" dir="ltr" style={{ color: "#CBD5E1" }}>
                contact@code-up.tech
              </a>
            </li>
          </ul>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="max-w-[1320px] mx-auto px-5 sm:px-7 mt-8 sm:mt-12 py-4 sm:py-5 flex flex-col sm:flex-row items-center justify-between gap-3"
           style={{ borderTop: "1px solid #16273A" }}>
        <span className="text-xs sm:text-sm order-2 sm:order-1" style={{ color: "#94A3B8" }}>
          © Code-UP {year} — جميع الحقوق محفوظة.
        </span>
        <div className="flex items-center gap-3 order-1 sm:order-2">
          <Link href="/adminpanel" className="text-xs no-underline transition-colors hover:text-white" style={{ color: "#64748B" }}>⚙</Link>
          <a href="https://kemetcraft.me/" target="_blank" rel="noopener noreferrer"
             className="text-xs no-underline transition-colors hover:text-white tracking-wide" style={{ color: "#64748B" }}>
            Made with ❤️ by KemetCraft
          </a>
        </div>
      </div>
    </footer>
  );
}
