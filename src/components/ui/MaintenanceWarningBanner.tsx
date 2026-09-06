"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, Clock, X } from "lucide-react";

export function MaintenanceWarningBanner() {
  const [warning, setWarning] = useState<{ active: boolean; message: string }>({
    active: false,
    message: "",
  });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const checkWarning = async () => {
      try {
        const res = await fetch("/api/system/warning-banner", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted) {
          setWarning(data);
          if (!data.active) {
            setDismissed(false); // Reset dismissal state once warning ends
          }
        }
      } catch {
        // fail silently on network interruptions
      }
    };

    // Check immediately on mount
    checkWarning();

    // Poll every 15 seconds so active users get warned in real-time
    const interval = setInterval(checkWarning, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  if (!warning.active || dismissed) return null;

  return (
    <div
      role="alert"
      className="relative z-[45] bg-gradient-to-r from-amber-600 via-orange-500 to-amber-600 text-white px-3 py-2 sm:px-6 shadow-md border-b border-amber-400/40 animate-in slide-in-from-top duration-300 transition-all font-sans"
      dir="rtl"
    >
      <div className="max-w-[1320px] mx-auto flex items-center justify-between gap-3 text-xs sm:text-sm">
        <div className="flex items-center gap-2.5 sm:gap-3 flex-1 min-w-0">
          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-black/25 backdrop-blur flex items-center justify-center shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-200 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
            <span className="inline-flex items-center gap-1 font-black bg-black/20 px-2 py-0.5 rounded-md text-[10px] sm:text-xs text-amber-100 shrink-0">
              <Clock className="w-3 h-3 text-amber-200" />
              <span>تنبيه مجدول</span>
            </span>
            <p className="font-semibold text-amber-50 text-[11px] sm:text-xs leading-relaxed truncate sm:whitespace-normal">
              {warning.message ||
                "سيتم إجراء تحديث سريع لموارد السيرفر بعد دقيقة واحدة (قد يستمر التوقف 30-60 ثانية). يرجى حفظ أي إجابات أو أعمال مفتوحة."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="p-1 rounded-lg hover:bg-black/20 text-amber-100 hover:text-white transition-colors cursor-pointer"
            title="إخفاء التنبيه مؤقتاً"
            aria-label="إغلاق التنبيه"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
