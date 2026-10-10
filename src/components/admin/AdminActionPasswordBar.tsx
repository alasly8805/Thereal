"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { Button, Field, Input, Modal } from "@/components/admin/ui/kit";

const STORE_KEY = "admin_action_password";
const EVENT = "admin_password_updated";

/** Custom banana key mark (the owner's action-password emblem). */
export function BananaKeySvg({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <path d="M20 25L38 25M34 25V28M38 25V29M30 25V27" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M12 15C15 13 21 15 23 20C24.5 23.5 23 28 19 32C15 36 10 34 8 31C6 28 8 23 10 18C10.5 16.5 11 15.5 12 15Z"
        fill="var(--gold-2)"
        stroke="var(--gold)"
        strokeWidth="1.5"
      />
      <circle cx="12" cy="28" r="2.5" fill="var(--surface)" stroke="var(--gold)" strokeWidth="1.5" />
    </svg>
  );
}

function readStored() {
  try {
    return sessionStorage.getItem(STORE_KEY) || "";
  } catch {
    return "";
  }
}

export function AdminActionPasswordBar({ onPasswordChange }: { onPasswordChange?: (pass: string) => void }) {
  // Session storage is read after mount so the server and first client render agree.
  const [password, setPassword] = useState("");
  const [isSaved, setIsSaved] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const stored = readStored();
    setPassword(stored);
    setIsSaved(Boolean(stored));
    // Keep every copy of this control (header + teachers section) in sync.
    const onUpdate = (e: Event) => {
      const next = (e as CustomEvent<string>).detail ?? readStored();
      setPassword(next);
      setIsSaved(Boolean(next));
    };
    window.addEventListener(EVENT, onUpdate);
    return () => window.removeEventListener(EVENT, onUpdate);
  }, []);

  const broadcast = (value: string) => {
    onPasswordChange?.(value);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: value }));
  };

  const handleSave = (e?: React.FormEvent) => {
    e?.preventDefault();
    try {
      if (password) sessionStorage.setItem(STORE_KEY, password);
      else sessionStorage.removeItem(STORE_KEY);
    } catch {
      /* ignore */
    }
    setIsSaved(Boolean(password));
    broadcast(password);
    setIsOpen(false);
  };

  const handleClear = () => {
    setPassword("");
    setIsSaved(false);
    try {
      sessionStorage.removeItem(STORE_KEY);
    } catch {
      /* ignore */
    }
    broadcast("");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`adm-btn is-sm ${isSaved ? "" : "is-gold"}`}
        title="مفتاح إجراءات المشرف — مطلوب للحذف وتعديل الحسابات ودخول لوحات المعلمين"
        aria-haspopup="dialog"
      >
        <BananaKeySvg className="w-5 h-5 shrink-0" />
        <span className="hidden sm:inline">{isSaved ? "المفتاح مفعّل" : "مفتاح الإجراءات"}</span>
        {isSaved && <span className="adm-dot" style={{ color: "var(--ok)" }} aria-label="مفعّل" />}
      </button>

      <Modal
        open={isOpen}
        onClose={() => setIsOpen(false)}
        size="sm"
        title="مفتاح إجراءات المشرف"
        description="مطلوب لحذف المعلمين وتعديل الحسابات ودخول لوحات المعلمين. يُحفظ في هذه الجلسة فقط ويُمسح عند إغلاق المتصفح."
        icon={
          <span className="relative block w-10 h-10 rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <Image src="/admin/banana_key.jpg" alt="" fill sizes="40px" className="object-cover" />
          </span>
        }
        footer={
          <>
            {isSaved && (
              <Button variant="danger" onClick={handleClear}>
                مسح المفتاح
              </Button>
            )}
            <Button variant="primary" type="submit" form="adm-action-pass" icon={<KeyRound size={15} />}>
              حفظ المفتاح
            </Button>
          </>
        }
      >
        <form id="adm-action-pass" onSubmit={handleSave}>
          <Field label="كلمة مرور الإجراءات" htmlFor="adm-action-pass-input">
            <div className="relative">
              <Input
                id="adm-action-pass-input"
                data-autofocus
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="off"
                mono
                style={{ paddingLeft: 44 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="adm-btn is-ghost is-icon is-sm absolute top-1/2 -translate-y-1/2"
                style={{ left: 4 }}
                aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>
        </form>
      </Modal>
    </>
  );
}
