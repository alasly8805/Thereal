"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";

interface VideoGuardProps {
  children: React.ReactNode;
  studentName?: string;
  studentPhone?: string;
  videoId?: string;
  onViolation?: (type: string, count: number) => void;
  onExit?: () => void;
  disabled?: boolean;
}

export function VideoGuard({
  children,
  studentName,
  studentPhone,
  videoId,
  onViolation,
  onExit,
  disabled = false,
}: VideoGuardProps) {
  const [hasViolation, setHasViolation] = useState(false);
  const [violationType, setViolationType] = useState<string>("");
  const [violationCount, setViolationCount] = useState(0);
  const [isTabHidden, setIsTabHidden] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const pauseAllVideos = useCallback(() => {
    try {
      const videos = document.querySelectorAll("video");
      videos.forEach((v) => {
        if (!v.paused) v.pause();
      });
    } catch {}
  }, []);


  const reportedTypesRef = useRef<Set<string>>(new Set());

  // Report violation to backend API
  const reportViolation = useCallback(
    async (type: string, details?: string) => {
      if (disabled) return;
      // Avoid spamming API for same violation repeatedly within short period
      const key = `${type}-${Math.floor(Date.now() / 5000)}`;
      if (reportedTypesRef.current.has(key)) return;
      reportedTypesRef.current.add(key);

      try {
        await fetch("/api/security/violation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, videoId, details }),
        });
      } catch {
        // Silent catch for security endpoint errors
      }

      setViolationCount((prev) => {
        const next = prev + 1;
        onViolation?.(type, next);
        return next;
      });
    },
    [videoId, onViolation, disabled]
  );

  const triggerViolationModal = useCallback(
    (type: string, details?: string) => {
      if (disabled) return;
      pauseAllVideos();
      setHasViolation(true);
      setViolationType(type);
      void reportViolation(type, details);
    },
    [reportViolation, pauseAllVideos, disabled]
  );

  // 1. DevTools Detection Mechanisms
  useEffect(() => {
    if (disabled) return;

    const checkDevTools = () => {
      // Tablets and mobile devices (like Ministry tablets, iPads, Android) DO NOT have dockable DevTools.
      // Furthermore, window.outerHeight includes Android system bars (status bar + navigation bar + browser tabs),
      // making outerHeight - innerHeight easily exceed 160px naturally without any DevTools open.
      const isTouchOrMobile =
        typeof window !== "undefined" &&
        (navigator.maxTouchPoints > 0 ||
          /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));

      if (isTouchOrMobile) {
        return;
      }

      // Threshold check for DevTools dock (Desktop only, generous threshold for browser sidebars)
      const widthThreshold = window.outerWidth - window.innerWidth > 240;
      const heightThreshold = window.outerHeight - window.innerHeight > 240;

      if (widthThreshold || heightThreshold) {
        triggerViolationModal("DEVTOOLS", "DevTools window size threshold exceeded");
        return;
      }

      // Timing Trap via Debugger (Desktop only, safe threshold for CPU stalls)
      const startTime = Date.now();
      debugger;
      const endTime = Date.now();

      if (endTime - startTime > 200) {
        triggerViolationModal("DEVTOOLS", "Debugger breakpoint triggered");
      }
    };

    const checkInterval = setInterval(checkDevTools, 1500);
    return () => clearInterval(checkInterval);
  }, [triggerViolationModal, disabled]);

  // Helper to pause all video playback immediately upon focus loss or capture attempt
  // 2. Keyboard & PrintScreen / Screen-Recording Shortcuts Prevention
  useEffect(() => {
    if (disabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const k = e.key;
      const lowerK = k.toLowerCase();
      const isPrtScn = k === "PrintScreen" || e.code === "PrintScreen" || e.keyCode === 44;
      const isMeta =
        e.metaKey ||
        (typeof e.getModifierState === "function" &&
          (e.getModifierState("Meta") || e.getModifierState("OS")));

      // Physical KeyS or Arabic "س"
      const isKeyS = lowerK === "s" || lowerK === "س" || e.code === "KeyS" || e.keyCode === 83;
      // Physical KeyG or Arabic "ل"
      const isKeyG = lowerK === "g" || lowerK === "ل" || e.code === "KeyG" || e.keyCode === 71;
      // Physical KeyR or Arabic "ق"
      const isKeyR = lowerK === "r" || lowerK === "ق" || e.code === "KeyR" || e.keyCode === 82;

      const isWinSnipping = isMeta && e.shiftKey && isKeyS;
      const isWinGameBar = isMeta && (isKeyG || (e.altKey && isKeyR));
      const isMacScreenshot = isMeta && e.shiftKey && ["3", "4", "5", "#", "$", "%"].includes(k);
      const isBrowserScreenshot = (e.ctrlKey || isMeta) && e.shiftKey && isKeyS;

      // F12 / DevTools
      if (k === "F12" || ((e.ctrlKey || isMeta) && e.shiftKey && ["i", "j", "c", "ه", "ـ", "ؤ"].includes(lowerK))) {
        e.preventDefault();
        e.stopPropagation();
        pauseAllVideos();
        triggerViolationModal("DEVTOOLS", "DevTools attempt detected");
        return;
      }

      // View Source
      if ((e.ctrlKey || isMeta) && (lowerK === "u" || lowerK === "ع")) {
        e.preventDefault();
        e.stopPropagation();
        triggerViolationModal("DEVTOOLS", "View Source attempt");
        return;
      }

      // Save / Print
      if ((e.ctrlKey || isMeta) && (isKeyS || lowerK === "p" || lowerK === "ح")) {
        if (e.shiftKey) {
          // Handled as screenshot below
        } else {
          e.preventDefault();
          e.stopPropagation();
          triggerViolationModal("SCREENSHOT", `Pressed Ctrl+${lowerK.toUpperCase()}`);
          return;
        }
      }

      // Screen Capture Attempts (PrintScreen, Snipping Tool, GameBar, Mac Screenshot)
      if (isPrtScn || isWinSnipping || isWinGameBar || isMacScreenshot || isBrowserScreenshot) {
        e.preventDefault();
        e.stopPropagation();
        pauseAllVideos();
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          navigator.clipboard.writeText("").catch(() => {});
        }
        triggerViolationModal("SCREENSHOT", "Screen capture / recording shortcut attempted");
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const k = e.key;
      const lowerK = k.toLowerCase();
      const isKeyS = lowerK === "s" || lowerK === "س" || e.code === "KeyS" || e.keyCode === 83;
      const isPrtScn = k === "PrintScreen" || e.code === "PrintScreen" || e.keyCode === 44;
      if (isPrtScn || isKeyS) {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          navigator.clipboard.writeText("").catch(() => {});
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
    };
  }, [triggerViolationModal, pauseAllVideos, disabled]);

  // 3. Right Click Context Menu Blocker (ignore touch devices to prevent long-press false positives)
  const handleContextMenu = (e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    const isTouch = typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
    if (!isTouch) {
      void reportViolation("CONTEXT_MENU", "Right click attempted");
    }
  };

  // 4. Tab Visibility & Window Focus Monitoring (Pause and protect when tab is backgrounded or when snipping tools steal focus)
  useEffect(() => {
    if (disabled) return;

    const isTouch =
      typeof navigator !== "undefined" &&
      (navigator.maxTouchPoints > 0 ||
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

    const handleWindowBlur = () => {
      if (isTouch) return;
      // YouTube/VdoCipher iframes steal window focus on load. That is not a tab
      // switch — treating it as one paints a black overlay and the video never starts.
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if (active instanceof HTMLIFrameElement && wrapRef.current?.contains(active)) return;
        if (document.visibilityState === "visible" && active instanceof HTMLIFrameElement) return;
        setIsTabHidden(true);
        pauseAllVideos();
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          navigator.clipboard.writeText("").catch(() => {});
        }
      });
    };

    const handleWindowFocus = () => {
      if (document.hasFocus()) {
        setIsTabHidden(false);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        setIsTabHidden(true);
        pauseAllVideos();
        void reportViolation("TAB_SWITCH", "User switched away from tab");
      } else {
        handleWindowFocus();
      }
    };

    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [reportViolation, pauseAllVideos, disabled]);

  return (
    <div
      ref={wrapRef}
      onContextMenu={disabled ? undefined : handleContextMenu}
      className="relative select-none w-full"
      style={{ userSelect: "none", WebkitUserSelect: "none" }}
    >
      {/* Printable CSS override to hide video if printed */}
      <style jsx global>{`
        @media print {
          body {
            display: none !important;
          }
        }
      `}</style>

      {/* Main Video Content */}
      <div className={!disabled && hasViolation ? "invisible pointer-events-none" : ""}>
        {children}
      </div>

      {/* Tab Hidden Blur Overlay — 100% solid black barrier to block all snipping tools */}
      {!disabled && isTabHidden && !hasViolation && (
        <div
          className="absolute inset-0 bg-black z-50 flex flex-col items-center justify-center p-6 text-center text-white select-none cursor-pointer"
          onClick={() => setIsTabHidden(false)}
          role="button"
          tabIndex={0}
        >
          <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-2xl mb-3">
            ⏸️
          </div>
          <h3 className="text-lg font-bold">تم إيقاف المشاهدة مؤقتاً</h3>
          <p className="text-slate-400 text-xs mt-1 max-w-sm">
            تم التوقف وتعتيم الشاشة تلقائياً عند مغادرة الصفحة لحماية المحتوى ورصيد المشاهدة.
          </p>
          <p className="text-sky-400 text-xs mt-3 font-bold">اضغط هنا للمتابعة</p>
        </div>
      )}

      {/* Security Violation Modal Alert */}
      {!disabled && hasViolation && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center text-white dir-rtl">
          <div className="max-w-md w-full bg-slate-900 border border-rose-500/40 rounded-3xl p-8 space-y-6 shadow-2xl shadow-rose-950/50">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center mx-auto text-3xl animate-bounce">
              🚨
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-black text-rose-400">
                تنبيه أمني عاجل
              </h2>
              <p className="text-base font-bold text-white">
                هذا الإجراء غير مسموح به وقد يعرضك للمساءلة القانونية والحظر النهائي
              </p>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-right text-xs space-y-2 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">نوع المخالفة:</span>
                <span className="text-rose-400 font-bold">{violationType || "محاولة استخراج المحتوى"}</span>
              </div>
              {studentName && (
                <div className="flex justify-between">
                  <span className="text-slate-400">اسم الحساب:</span>
                  <span className="text-slate-200">{studentName}</span>
                </div>
              )}
              {studentPhone && (
                <div className="flex justify-between">
                  <span className="text-slate-400">رقم الهاتف:</span>
                  <span className="text-slate-200 dir-ltr">{studentPhone}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">عدد المحاولات:</span>
                <span className="text-rose-400 font-bold">{violationCount}</span>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              تم تسجيل هذه المحاولة وحفظ عنوان الـ IP والبيانات الأمنية في سجل المخالفات الخاص بإدارة المنصة.
            </p>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  setHasViolation(false);
                  if (onExit) onExit();
                }}
                className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm transition-all shadow-lg shadow-rose-600/30 cursor-pointer"
              >
                فهمت وتعهد بعدم التكرار (متابعة)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
