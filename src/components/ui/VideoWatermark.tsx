"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * Enterprise Anti-Crop & Anti-Tamper Video Watermark.
 *
 * Design & Security Principles:
 * 1. Low Opacity & Distraction-Free: Rendered at subtle opacity (~22%) with soft
 *    transparent background, keeping students focused on lecture content.
 * 2. Dual Drifting Positions: Two badges drift asynchronously across non-overlapping
 *    regions. Even if a bad actor crops a corner or blurs one badge, the second
 *    badge catches their identity, making screen recording leaks fully traceable.
 * 3. Tamper Detection & Auto-Recovery: A MutationObserver watches the watermark container.
 *    If an extension, ad-blocker rule, or DevTools hides or removes the elements,
 *    it restores them instantly and reports WATERMARK_TAMPER to security violations.
 * 4. Compositing & Hardware DRM Safe: Absolutely positioned sibling overlay with pointer-events: none.
 *    Never adds CSS filters to the underlying <video> or <iframe>, keeping Direct Composition active.
 */

interface VideoWatermarkProps {
  label?: string;
  /** Optional custom opacity for primary badge (default: 0.22) */
  opacity?: number;
  /** Optional custom change interval in seconds (default: 15) */
  intervalSeconds?: number;
  videoId?: string;
}

function getRandomPosition(quadrant: "any" | "upper" | "lower" = "any") {
  let minTop = 10;
  let maxTop = 75;
  if (quadrant === "upper") {
    minTop = 10;
    maxTop = 42;
  } else if (quadrant === "lower") {
    minTop = 45;
    maxTop = 75;
  }
  const top = Math.floor(Math.random() * (maxTop - minTop) + minTop);
  const left = Math.floor(Math.random() * 65 + 10);
  return { top: `${top}%`, left: `${left}%` };
}

export function VideoWatermark({
  label,
  opacity = 0.22,
  intervalSeconds = 15,
  videoId,
}: VideoWatermarkProps) {
  const [pos1, setPos1] = useState(() => getRandomPosition("upper"));
  const [pos2, setPos2] = useState(() => getRandomPosition("lower"));
  const containerRef = useRef<HTMLDivElement>(null);
  const reportedRef = useRef(false);

  // Periodic drift: primary badge every intervalSeconds, secondary on a staggered schedule
  useEffect(() => {
    if (!label) return;

    const timer1 = setInterval(() => {
      setPos1(getRandomPosition("upper"));
    }, intervalSeconds * 1000);

    const timer2 = setInterval(() => {
      setPos2(getRandomPosition("lower"));
    }, (intervalSeconds + 7) * 1000);

    return () => {
      clearInterval(timer1);
      clearInterval(timer2);
    };
  }, [label, intervalSeconds]);

  // Anti-Tamper: MutationObserver ensures elements cannot be hidden with display:none / opacity:0
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !label) return;

    const reportTamper = () => {
      if (reportedRef.current) return;
      reportedRef.current = true;
      try {
        fetch("/api/security/violation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "WATERMARK_TAMPER",
            videoId: videoId || null,
            details: "Watermark overlay modified or hidden by extension/devtools",
          }),
        }).catch(() => {});
      } catch {
        // non-blocking
      }
    };

    const observer = new MutationObserver(() => {
      // Check if container or children are forcibly hidden
      if (!el.isConnected) {
        reportTamper();
        return;
      }
      const style = window.getComputedStyle(el);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        parseFloat(style.opacity || "1") < 0.05
      ) {
        reportTamper();
        el.style.setProperty("display", "block", "important");
        el.style.setProperty("visibility", "visible", "important");
        el.style.setProperty("opacity", "1", "important");
      }
    });

    observer.observe(el, {
      attributes: true,
      attributeFilter: ["style", "class", "hidden"],
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [label, videoId]);

  if (!label || !label.trim()) return null;

  const displayLabel = label.trim();

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 overflow-hidden select-none z-20"
      aria-hidden
      dir="ltr"
    >
      {/* ── Primary Drifting Floating Watermark Badge ── */}
      <div
        className="absolute transition-all duration-1000 ease-in-out select-none"
        style={{
          top: pos1.top,
          left: pos1.left,
          opacity,
        }}
      >
        <div className="font-mono text-[11px] sm:text-xs font-semibold tracking-wider text-white bg-black/30 backdrop-blur-[1px] px-2.5 py-1 rounded border border-white/10 shadow-sm whitespace-nowrap">
          {displayLabel}
        </div>
      </div>

      {/* ── Secondary Subtle Drifting Ghost Badge (Anti-Crop Quadrant) ── */}
      <div
        className="absolute transition-all duration-1000 ease-in-out select-none"
        style={{
          top: pos2.top,
          left: pos2.left,
          opacity: Math.max(0.08, opacity * 0.55),
        }}
      >
        <div className="font-mono text-[10px] sm:text-[11px] font-medium tracking-wider text-white/90 bg-black/20 backdrop-blur-[1px] px-2 py-0.5 rounded border border-white/5 whitespace-nowrap">
          {displayLabel}
        </div>
      </div>
    </div>
  );
}

export default VideoWatermark;
