"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Mobile-only bottom navigation select dropdown.
 * Replaces the hamburger menu and the traditional bottom tab icons.
 */
export function MobileTabBar() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);

  const visible =
    !pathname.includes("/learn") &&
    !pathname.startsWith("/adminpanel") &&
    !pathname.startsWith("/admin") &&
    !pathname.startsWith("/parent") &&
    !pathname.startsWith("/p/");

  // Fetch student session to dynamically show login/signup or logout options
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) {
          setUser(data.user);
        } else {
          setUser(null);
        }
      })
      .catch(() => {});
  }, [pathname]); // Refresh on navigation changes to keep auth state sync'd

  // Toggle a body class so page content + footer clear the fixed bar (see globals.css).
  useEffect(() => {
    if (!visible) return;
    document.body.classList.add("has-bottom-nav");
    return () => document.body.classList.remove("has-bottom-nav");
  }, [visible]);

  if (!visible) return null;

  const getActiveValue = () => {
    if (pathname === "/") return "/";
    if (pathname.startsWith("/library")) return "/library";
    if (pathname.startsWith("/courses")) return "/courses";
    if (pathname.startsWith("/practice")) return "/practice";
    if (pathname.startsWith("/environments")) return "/environments";
    if (pathname.startsWith("/leaderboard")) return "/leaderboard";
    if (pathname.startsWith("/account")) return "/account";
    if (pathname.startsWith("/login")) return "/login";
    if (pathname.startsWith("/signup")) return "/signup";
    return "";
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch (e) {
      console.error("Logout request failed:", e);
    }
    router.push("/login");
    router.refresh();
  };

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === "logout") {
      await handleLogout();
    } else if (val) {
      router.push(val);
    }
  };

  // Visible on mobile and tablet (< 1024px) since top desktop nav links hide under lg breakpoint
  return (
    <nav
      dir="rtl"
      aria-label="التنقل السريع"
      className="lg:hidden fixed bottom-0 inset-x-0 z-[var(--z-sticky)]"
      style={{
        background: "var(--nav)",
        borderTop: "1px solid var(--border)",
        padding: "10px 14px calc(10px + env(safe-area-inset-bottom, 0px))",
        boxShadow: "0 -6px 20px -14px rgba(0,0,0,.35)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", maxWidth: "480px", margin: "0 auto" }}>
        {/* Navigation Compass Icon */}
        <div style={{
          width: "40px",
          height: "40px",
          borderRadius: "10px",
          background: "var(--brand-soft)",
          color: "var(--brand)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
          </svg>
        </div>

        {/* Select Dropdown Menu */}
        <div style={{ position: "relative", flex: 1 }}>
          <select
            value={getActiveValue()}
            onChange={handleChange}
            style={{
              width: "100%",
              height: "44px",
              padding: "0 14px 0 40px",
              borderRadius: "12px",
              border: "1px solid var(--border-strong)",
              background: "var(--surface-2)",
              color: "var(--ink)",
              fontFamily: "'IBM Plex Sans Arabic', sans-serif",
              fontSize: "14.5px",
              fontWeight: 700,
              textAlign: "right",
              appearance: "none",
              outline: "none",
              cursor: "pointer"
            }}
          >
            <option value="" disabled>— قائمة التنقل السريع —</option>
            <option value="/">🏠 الرئيسية</option>
            <option value="/library">📖 مكتبتي</option>
            {user?.role === "student" && <option value="/practice">✍️ التدريبات اليومية</option>}
            <option value="/courses">📚 الكورسات</option>
            <option value="/environments">🔬 بيئات التعلم</option>
            <option value="/leaderboard">🏆 لوحة الشرف</option>
            <option value="/account">👤 حسابي</option>
            
            {user ? (
              <option value="logout" style={{ color: "var(--danger)" }}>🚪 تسجيل الخروج</option>
            ) : (
              <>
                <option value="/login">🔑 دخول</option>
                <option value="/signup">📝 إنشاء حساب</option>
              </>
            )}
          </select>

          {/* Chevron Arrow Icon */}
          <div style={{
            position: "absolute",
            left: "14px",
            top: "50%",
            transform: "translateY(-50%)",
            pointerEvents: "none",
            color: "var(--ink-2)",
            display: "flex",
            alignItems: "center"
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </div>
        </div>
      </div>
    </nav>
  );
}
