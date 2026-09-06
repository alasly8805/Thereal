"use client";

import React, { useState } from "react";
import Image from "next/image";
import { KeyRound, Eye, EyeOff, ShieldCheck, X } from "lucide-react";

/** Custom Handcrafted Banana Key SVG */
export function BananaKeySvg({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Outer Glow / Halo */}
      <circle cx="24" cy="24" r="22" className="fill-amber-500/10 dark:fill-emerald-500/10 stroke-amber-500/30 dark:stroke-emerald-500/30" strokeWidth="1.5" />
      
      {/* Key Shaft / Blade */}
      <path
        d="M20 25L38 25M34 25V28M38 25V29M30 25V27"
        className="stroke-amber-600 dark:stroke-emerald-400"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Stylized Golden / Emerald Banana Head */}
      <path
        d="M12 15C15 13 21 15 23 20C24.5 23.5 23 28 19 32C15 36 10 34 8 31C6 28 8 23 10 18C10.5 16.5 11 15.5 12 15Z"
        className="fill-amber-400 dark:fill-emerald-500 stroke-amber-600 dark:stroke-emerald-300"
        strokeWidth="1.5"
      />

      {/* Cyber Circuit Trace inside Banana */}
      <path
        d="M11 20C13 22 17 24 16 28M13 26L16 26"
        className="stroke-emerald-900 dark:stroke-emerald-950"
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* Key Ring Hole */}
      <circle cx="12" cy="28" r="2.5" className="fill-white dark:fill-slate-950 stroke-amber-700 dark:stroke-emerald-300" strokeWidth="1.5" />
    </svg>
  );
}

export function AdminActionPasswordBar({
  onPasswordChange,
}: {
  onPasswordChange?: (pass: string) => void;
}) {
  const [password, setPassword] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return sessionStorage.getItem("admin_action_password") || "";
    } catch {
      return "";
    }
  });
  const [isOpen, setIsOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSaved, setIsSaved] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return Boolean(sessionStorage.getItem("admin_action_password"));
    } catch {
      return false;
    }
  });

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      sessionStorage.setItem("admin_action_password", password);
      setIsSaved(Boolean(password));
      onPasswordChange?.(password);
      window.dispatchEvent(new CustomEvent("admin_password_updated", { detail: password }));
      setIsOpen(false);
    } catch {
      /* ignore */
    }
  };

  const handleClear = () => {
    setPassword("");
    setIsSaved(false);
    try {
      sessionStorage.removeItem("admin_action_password");
      onPasswordChange?.("");
      window.dispatchEvent(new CustomEvent("admin_password_updated", { detail: "" }));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="relative">
      {/* Custom Banana Key Header Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm ${
          isSaved
            ? "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
            : "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800"
        }`}
        title="مفتاح إجراءات المشرف (انقر لإدخال أو تعديل كلمة المرور)"
      >
        <BananaKeySvg className="w-5 h-5 shrink-0" />
        <span className="hidden sm:inline">
          {isSaved ? "مفتاح الإجراءات: مفعّل ✓" : "أدخل كلمة مرور الإجراءات"}
        </span>
      </button>

      {/* Popover Card for Entering Action Password */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div
            dir="rtl"
            className="fixed sm:absolute left-1/2 -translate-x-1/2 sm:translate-x-0 sm:left-auto sm:right-0 top-16 sm:top-full sm:mt-2 w-[92vw] max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-4 sm:p-5 z-50 animate-in fade-in slide-in-from-top-2 duration-200"
          >
            {/* Header & Banana Key Emblem */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="relative w-10 h-10 rounded-xl overflow-hidden border border-amber-500/40 dark:border-emerald-500/40 shadow-sm shrink-0">
                  <Image
                    src="/admin/banana_key.jpg"
                    alt="Banana Security Key"
                    fill
                    className="object-cover"
                  />
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>مفتاح إجراءات المشرف</span>
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    مطلوبة لحذف المعلمين، تعديل الحسابات، ودخول لوحات المعلمين.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Input Form */}
            <form onSubmit={handleSave} className="space-y-3">
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="اكتب كلمة مرور المشرف هنا..."
                  autoFocus
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 pl-10 text-xs font-mono text-slate-900 outline-none focus:border-emerald-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-emerald-700 dark:hover:bg-emerald-600 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>تثبيت وتفعيل المفتاح</span>
                </button>

                {isSaved && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50 text-xs font-bold transition-all cursor-pointer"
                    title="مسح المفتاح من الجلسة"
                  >
                    مسح
                  </button>
                )}
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
