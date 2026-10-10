"use client";
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { Button, Field, Input } from "@/components/admin/ui/kit";

/**
 * Locks a section behind the access password (BULK_DELETE_PASSWORD). Children —
 * and any data they load — are not rendered until the password is verified
 * server-side. Unlock lasts for the browser session only.
 */
export function AccessGate({ id, title, type, children }: { id: string; title: string; type?: string; children: React.ReactNode }) {
  const storeKey = `gate_${id}`;
  const [unlocked, setUnlocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  // Read the session unlock after mount (sessionStorage is not available during SSR).
  useEffect(() => {
    let cancelled = false;
    try {
      if (sessionStorage.getItem(storeKey) === "1") setUnlocked(true);
    } catch {
      /* private mode */
    }
    setReady(true);
    void fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then((data: { user?: { demoTour?: boolean } }) => {
        if (cancelled || !data?.user?.demoTour) return;
        try {
          sessionStorage.setItem(storeKey, "1");
        } catch {
          /* ignore */
        }
        setUnlocked(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [storeKey]);

  if (!ready) return null;
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
      try {
        sessionStorage.setItem(storeKey, "1");
      } catch {
        /* ignore */
      }
      setPassword("");
      setUnlocked(true);
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="mx-auto mt-6 sm:mt-12 w-full max-w-md" dir="rtl">
      <div className="adm-panel p-6 sm:p-8">
        <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl" style={{ background: "var(--gold-soft)", color: "var(--gold)" }} aria-hidden>
          <Lock size={22} />
        </span>
        <h1 className="adm-h2 text-center">{title}</h1>
        <p className="adm-sub text-center mt-2">
          منطقة محميّة. أدخل كلمة مرور الوصول للمتابعة — تبقى مفتوحة حتى تغلق المتصفح.
          <br />
          إن لم تعرفها اطلبها من المالك ({type === "wallet" ? "«كلمة مرور المحفظة»" : "«كلمة مرور الـ bulk»"}).
        </p>
        <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
          <Field label="كلمة مرور الوصول" htmlFor={`gate-${id}`} error={error || undefined}>
            <Input
              id={`gate-${id}`}
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError("");
              }}
              placeholder="••••••••"
              autoFocus
              autoComplete="off"
              aria-invalid={error ? true : undefined}
            />
          </Field>
          <Button type="submit" variant="primary" block loading={checking} disabled={!password}>
            فتح
          </Button>
        </form>
      </div>
    </div>
  );
}
