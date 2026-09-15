"use client";
import { useEffect, useState } from "react";

/**
 * Locks a section behind the access password (BULK_DELETE_PASSWORD). Children —
 * and any data they load — are not rendered until the password is verified
 * server-side. Unlock lasts for the browser session only.
 */
export function AccessGate({ id, title, type, children }: { id: string; title: string; type?: string; children: React.ReactNode }) {
  const storeKey = `gate_${id}`;
  const [unlocked, setUnlocked] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(storeKey) === "1";
  });
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then((data: { user?: { demoTour?: boolean } }) => {
        if (cancelled || !data?.user?.demoTour) return;
        sessionStorage.setItem(storeKey, "1");
        setUnlocked(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [storeKey]);

  if (unlocked) return <>{children}</>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setChecking(true);
    setError("");
    try {
      const res = await fetch("/api/admin/superadmin/access-gate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, type }),
      });
      if (!res.ok) {
        setError("كلمة المرور غير صحيحة");
        return;
      }
      sessionStorage.setItem(storeKey, "1");
      setPassword("");
      setUnlocked(true);
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="mx-auto mt-10 max-w-md" dir="rtl">
      <div className="rounded-2xl p-6 text-center" style={{ border: "1px solid var(--gold-soft)", background: "var(--gold-soft)" }}>
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl text-2xl" style={{ background: "var(--surface)" }}>🔒</div>
        <h2 className="text-lg font-black" style={{ color: "var(--ink)" }}>{title}</h2>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
          هذه المنطقة محميّة. أدخل كلمة مرور الوصول للمتابعة.
          <br />
          إن لم تكن تعرفها، اطلبها من المالك (قل له: {type === "wallet" ? "«أحتاج كلمة مرور المحفظة»" : "«أحتاج كلمة مرور الـ bulk»"}).
        </p>
        <form onSubmit={submit} className="mt-5 space-y-3 text-right">
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError("");
            }}
            placeholder="••••••••"
            autoFocus
            className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none"
            style={{ border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink)" }}
          />
          {error && <p className="text-xs" style={{ color: "var(--danger)" }}>{error}</p>}
          <button
            type="submit"
            disabled={checking}
            className="w-full rounded-xl py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer border-none"
            style={{ background: "var(--gold-2)" }}
          >
            {checking ? "جارٍ التحقق..." : "دخول"}
          </button>
        </form>
      </div>
    </div>
  );
}
