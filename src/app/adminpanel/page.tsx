"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useSyncExternalStore } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { getResolvedTheme, setThemePreference, type Theme } from "@/lib/theme";

const TABS = [
  { id: "teacher", label: "مدرّس", hint: "اسمك أو بريدك + كلمة المرور" },
  { id: "assistant", label: "مساعد", hint: "الاسم + الباسورد → لوحة المساعد" },
  { id: "staff_portal", label: "مشرف", hint: "البريد الإلكتروني + كلمة المرور" },
  { id: "superadmin", label: "المشرف العام", hint: "كلمة مرور المشرف فقط" },
] as const;

type Tab = (typeof TABS)[number]["id"];

const ROLE_IDS: Tab[] = TABS.map((t) => t.id);
const LAST_ROLE_KEY = "adminpanel-role";

function isTab(value: string | null): value is Tab {
  return !!value && (ROLE_IDS as string[]).includes(value);
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener("themechange", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("themechange", cb);
  };
}
const getSnapshot = (): Theme => getResolvedTheme();
const getServerSnapshot = (): Theme => "light";

export default function AdminPanelLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: "var(--bg)" }} />}>
      <AdminPanelLoginForm />
    </Suspense>
  );
}

function AdminPanelLoginForm() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>("teacher");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isDark = theme === "dark";
  const cycleTheme = () => setThemePreference(isDark ? "light" : "dark");

  useEffect(() => {
    const fromQuery = searchParams.get("error");
    if (fromQuery) setError(fromQuery);

    const fromRole = searchParams.get("role");
    if (isTab(fromRole)) {
      setActiveTab(fromRole);
      return;
    }
    try {
      const stored = window.localStorage.getItem(LAST_ROLE_KEY);
      if (isTab(stored)) setActiveTab(stored);
    } catch {
      /* ignore */
    }
  }, [searchParams]);

  const resetForm = (tab: Tab) => {
    setActiveTab(tab);
    setError("");
    setShowPassword(false);
    setForm({ name: "", email: "", password: "" });
    try {
      window.localStorage.setItem(LAST_ROLE_KEY, tab);
    } catch {
      /* ignore */
    }
  };

  const hint = TABS.find((t) => t.id === activeTab)?.hint;

  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col" style={{ fontFamily: "var(--font-body)" }}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: isDark
            ? "radial-gradient(90% 70% at 80% -10%, rgba(47,182,164,.18), transparent 55%), radial-gradient(70% 50% at 0% 100%, rgba(224,179,84,.08), transparent 50%), var(--bg)"
            : "radial-gradient(90% 70% at 80% -10%, rgba(14,110,98,.12), transparent 55%), radial-gradient(70% 50% at 0% 100%, rgba(176,125,38,.08), transparent 50%), var(--bg)",
        }}
        aria-hidden
      />

      <header className="relative z-10 flex items-center justify-between px-4 sm:px-8 py-5">
        <Link href="/" className="transition-transform hover:scale-[1.02]">
          <BrandLogo size={36} showText showTagline={false} />
        </Link>
        <button
          type="button"
          onClick={cycleTheme}
          aria-label="تبديل السمة"
          className="flex items-center justify-center rounded-xl border cursor-pointer transition-colors"
          style={{
            width: 40,
            height: 40,
            borderColor: "var(--border)",
            background: "var(--surface)",
            color: "var(--ink-2)",
          }}
        >
          {isDark ? (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          ) : (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
            </svg>
          )}
        </button>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-4 pb-10">
        <div className="w-full" style={{ maxWidth: 440 }}>
          <div className="text-center mb-6">
            <p
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold mb-3"
              style={{
                background: "var(--brand-soft)",
                color: "var(--brand-strong)",
                border: "1px solid var(--border)",
              }}
            >
              دخول آمن
            </p>
            <h1
              style={{
                fontFamily: "var(--font-head)",
                fontWeight: 900,
                fontSize: 28,
                margin: "0 0 6px",
                color: "var(--ink)",
              }}
            >
              لوحة الإدارة
            </h1>
            <p style={{ fontSize: 14, color: "var(--ink-3)", margin: 0 }}>Code-UP — المدرسين والمشرفين</p>
          </div>

          <div
            className="rounded-[22px] border p-4 sm:p-6"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <div className="grid grid-cols-2 gap-2 mb-5">
              {TABS.map((tab) => {
                const selected = activeTab === tab.id;
                const isOwner = tab.id === "superadmin";
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => resetForm(tab.id)}
                    className="cursor-pointer text-center transition-all"
                    style={{
                      minHeight: 48,
                      padding: "10px 8px",
                      borderRadius: 14,
                      border: selected
                        ? isOwner
                          ? "1px solid var(--gold)"
                          : "1px solid var(--brand)"
                        : "1px solid var(--border)",
                      fontFamily: "var(--font-body)",
                      fontWeight: selected ? 800 : 600,
                      fontSize: 14,
                      color: selected ? (isOwner ? "#3A2A0A" : "#fff") : "var(--ink-2)",
                      background: selected ? (isOwner ? "var(--gold)" : "var(--brand)") : "var(--surface-2)",
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 18px", lineHeight: 1.7 }}>{hint}</p>

            {error && (
              <div
                className="mb-4 flex items-start gap-2"
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid var(--danger)",
                  background: "var(--danger-soft)",
                  color: "var(--danger)",
                  fontSize: 13.5,
                  lineHeight: 1.6,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4m0 4h.01" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <form
              action="/adminpanel/login"
              method="post"
              onSubmit={() => {
                setLoading(true);
                window.setTimeout(() => setLoading(false), 15000);
              }}
            >
              <input type="hidden" name="role" value={activeTab} />

              {(activeTab === "teacher" || activeTab === "assistant") && (
                <Field
                  label={activeTab === "assistant" ? "اسم المساعد" : "اسم المعلم أو البريد"}
                  name="name"
                  autoComplete="username"
                  value={form.name}
                  onChange={(v) => setForm({ ...form, name: v })}
                  placeholder={activeTab === "assistant" ? "الاسم اللي المدرّس كتبه" : "اسمك أو البريد"}
                />
              )}

              {activeTab === "staff_portal" && (
                <Field
                  label="البريد الإلكتروني"
                  name="email"
                  type="email"
                  autoComplete="username"
                  value={form.email}
                  onChange={(v) => setForm({ ...form, email: v })}
                  placeholder="admin@example.com"
                  ltr
                />
              )}

              <label style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: "var(--ink-2)", marginBottom: 8 }}>
                كلمة المرور
              </label>
              <div className="relative mb-5">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  required
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full"
                  style={{
                    padding: "15px 48px 15px 16px",
                    borderRadius: 14,
                    border: "1px solid var(--border)",
                    background: "var(--surface-2)",
                    color: "var(--ink)",
                    fontFamily: "var(--font-body)",
                    fontSize: 16,
                    outline: "none",
                    minHeight: 52,
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute top-1/2 -translate-y-1/2 left-3 cursor-pointer border-none bg-transparent"
                  style={{ color: "var(--ink-3)", padding: 6 }}
                  aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full cursor-pointer border-none transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{
                  padding: 16,
                  borderRadius: 14,
                  minHeight: 54,
                  background: activeTab === "superadmin" ? "var(--gold)" : "var(--brand)",
                  color: activeTab === "superadmin" ? "#3A2A0A" : "#fff",
                  fontFamily: "var(--font-head)",
                  fontWeight: 800,
                  fontSize: 17,
                  boxShadow: activeTab === "superadmin" ? "0 12px 26px -10px rgba(176,125,38,.45)" : "0 12px 26px -10px var(--brand-shadow)",
                }}
              >
                {loading ? "جارٍ الدخول..." : "دخول"}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
  ltr,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  autoComplete?: string;
  ltr?: boolean;
}) {
  return (
    <>
      <label style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: "var(--ink-2)", marginBottom: 8 }}>
        {label}
      </label>
      <input
        type={type}
        name={name}
        required
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "15px 16px",
          borderRadius: 14,
          border: "1px solid var(--border)",
          background: "var(--surface-2)",
          color: "var(--ink)",
          fontFamily: "var(--font-body)",
          fontSize: 16,
          marginBottom: 16,
          outline: "none",
          minHeight: 52,
          direction: ltr ? "ltr" : undefined,
        }}
      />
    </>
  );
}
