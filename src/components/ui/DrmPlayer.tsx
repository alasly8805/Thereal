"use client";

import React, { useEffect, useRef, useState } from "react";
import { SAME_ORIGIN_LICENSE_SERVERS } from "@/lib/axinom-config";
import { useApplyPlaybackRate, usePlaybackRate } from "./VideoSpeedMenu";
import { VideoControlBar } from "./VideoControlBar";

interface ShakaPlayerInstance {
  destroy: () => Promise<void>;
  addEventListener: (event: string, handler: (e?: { detail?: { category?: number; code?: number; message?: string } }) => void) => void;
  configure: (config: unknown) => void;
  getNetworkingEngine: () => {
    registerRequestFilter: (
      filter: (
        type: unknown,
        request: { uris?: string[]; allowCrossSiteCredentials?: boolean; headers: Record<string, string> }
      ) => void
    ) => void;
  };
  load: (manifestUri: string, startTime?: number) => Promise<void>;
}

declare global {
  interface Window {
    shaka: {
      polyfill: { installAll: () => void };
      Player: {
        new (videoElement: HTMLVideoElement): ShakaPlayerInstance;
        isBrowserSupported: () => boolean;
      };
      net: {
        NetworkingEngine: {
          RequestType: {
            LICENSE: unknown;
          };
        };
      };
      util: {
        Error: {
          Category: {
            DRM: number;
            NETWORK: number;
          };
        };
      };
    };
  }
}

export interface DeviceDrmInfo {
  keySystem: string;
  type: "playready" | "widevine" | "fairplay" | "none";
  robustness?: string;
  isHardware: boolean;
  name: string;
}

export interface DrmPlayerProps {
  manifestUrl: string;
  drmToken?: string;
  licenseServers?: {
    widevine?: string;
    playready?: string;
    fairplay?: string;
    fairplayCertUrl?: string;
  };
  clearKeys?: Record<string, string>;
  initialPosition?: number;
  watermark?: string;
  title?: string;
  onTimeUpdate?: (seconds: number) => void;
  onEnded?: () => void;
  onPause?: () => void;
  onPlay?: () => void;
  onDrmDetected?: (drm: DeviceDrmInfo) => void;
  paused?: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  children?: React.ReactNode;
}

// Module-level singleton loader for Shaka Player
let shakaLoadPromise: Promise<void> | null = null;

function loadShakaPlayerLib(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.shaka) return Promise.resolve();
  if (shakaLoadPromise) return shakaLoadPromise;

  shakaLoadPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById("shaka-player-script") as HTMLScriptElement | null;
    if (existing && window.shaka) {
      resolve();
      return;
    }

    const script = existing || document.createElement("script");
    script.id = "shaka-player-script";
    // Same-origin copy — Brave Shields often blocks cdnjs and the player never boots.
    script.src = "/vendor/shaka-player.compiled.js";
    script.async = true;

    const onLoad = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      shakaLoadPromise = null;
      reject(new Error("تعذر تحميل مكتبة الحماية Shaka Player"));
    };
    const cleanup = () => {
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    };

    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);

    if (!existing) {
      document.head.appendChild(script);
    }
  });

  return shakaLoadPromise;
}

function isBraveBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } };
  if (nav.brave) return true;
  return /Brave/i.test(navigator.userAgent || "");
}

const BRAVE_WIDEVINE_HELP =
  "متصفح Brave يدعم الحماية، لكن Google Widevine قد يكون موقوفاً. افتح brave://settings/extensions وفعّل Google Widevine ثم أعد تحميل الصفحة. الفيديو يبقى مشفّراً (CENC) — لن يتم تشغيل نسخة غير محمية.";

/**
 * EME config that privacy browsers accept. Brave fingerprinting protection
 * rejects distinctiveIdentifier/persistentState = "required".
 */
function emeConfig(opts?: {
  initDataTypes?: string[];
  videoRobustness?: string;
  audioRobustness?: string;
}): MediaKeySystemConfiguration[] {
  const videoCapabilities: MediaKeySystemMediaCapability[] = [
    {
      contentType: 'video/mp4; codecs="avc1.42E01E"',
      ...(opts?.videoRobustness ? { robustness: opts.videoRobustness } : {}),
    },
  ];
  const audioCapabilities: MediaKeySystemMediaCapability[] = [
    {
      contentType: 'audio/mp4; codecs="mp4a.40.2"',
      ...(opts?.audioRobustness ? { robustness: opts.audioRobustness } : {}),
    },
  ];
  return [
    {
      initDataTypes: opts?.initDataTypes || ["cenc"],
      distinctiveIdentifier: "optional",
      persistentState: "optional",
      sessionTypes: ["temporary"],
      videoCapabilities,
      audioCapabilities,
    },
  ];
}

/** Rewrite Axinom license hosts to same-origin so Brave Shields cannot block them. */
function toSameOriginLicense(
  kind: "widevine" | "playready" | "fairplay",
  original?: string
): string | undefined {
  if (!original) return undefined;
  if (original.startsWith("/")) return original;
  return SAME_ORIGIN_LICENSE_SERVERS[kind];
}

/**
 * Standard W3C EME Device DRM capability probe.
 * Detects whether the host device supports PlayReady, Widevine, or FairPlay,
 * and whether hardware DRM (SL3000 / L1) is available.
 */
export async function detectDeviceDrm(): Promise<DeviceDrmInfo> {
  if (typeof navigator === "undefined" || !navigator.requestMediaKeySystemAccess) {
    return { keySystem: "", type: "none", isHardware: false, name: "غير مدعوم (No EME)" };
  }

  const probe = async (keySystem: string, configs: MediaKeySystemConfiguration[]) => {
    await navigator.requestMediaKeySystemAccess(keySystem, configs);
  };

  // 1. PlayReady Hardware (Microsoft Edge on Windows - SL3000 Hardware Protection)
  for (const ks of [
    "com.microsoft.playready.recommendation.3000",
    "com.microsoft.playready.recommendation",
  ]) {
    try {
      await probe(ks, emeConfig({ videoRobustness: "3000", audioRobustness: "3000" }));
      return {
        keySystem: ks,
        type: "playready",
        robustness: "3000",
        isHardware: true,
        name: "Microsoft PlayReady SL3000 (عتادي Hardware)",
      };
    } catch {
      // Continue probe
    }
  }

  // 2. PlayReady Standard (Microsoft Edge on Windows - Software)
  try {
    await probe("com.microsoft.playready", emeConfig());
    return {
      keySystem: "com.microsoft.playready",
      type: "playready",
      isHardware: false,
      name: "Microsoft PlayReady (برمجي Software)",
    };
  } catch {
    // Continue probe
  }

  // 3. Widevine Hardware (Android Tablets / Phones L1).
  // Probe strongest first. HW_SECURE_DECODE is enough to keep the video path
  // off the screenshot compositor; many L1 devices reject HW_SECURE_ALL.
  for (const robustness of ["HW_SECURE_ALL", "HW_SECURE_DECODE", "HW_SECURE_CRYPTO"] as const) {
    try {
      await probe(
        "com.widevine.alpha",
        emeConfig({ videoRobustness: robustness, audioRobustness: "HW_SECURE_CRYPTO" })
      );
      return {
        keySystem: "com.widevine.alpha",
        type: "widevine",
        robustness,
        isHardware: true,
        name: `Google Widevine L1 (${robustness})`,
      };
    } catch {
      // try the next hardware level
    }
  }

  // 4. Widevine Standard (Desktop Chrome, Brave, Firefox, Edge, Android L3)
  try {
    await probe("com.widevine.alpha", emeConfig({ videoRobustness: "SW_SECURE_CRYPTO", audioRobustness: "SW_SECURE_CRYPTO" }));
    return {
      keySystem: "com.widevine.alpha",
      type: "widevine",
      robustness: "SW_SECURE_CRYPTO",
      isHardware: false,
      name: "Google Widevine L3 (برمجي Software)",
    };
  } catch {
    // Continue probe
  }

  // Empty robustness — some Brave builds accept this after the component installs.
  try {
    await probe("com.widevine.alpha", emeConfig());
    return {
      keySystem: "com.widevine.alpha",
      type: "widevine",
      robustness: "SW_SECURE_CRYPTO",
      isHardware: false,
      name: "Google Widevine L3 (برمجي Software)",
    };
  } catch {
    // Continue probe
  }

  // 5. Apple FairPlay (Safari on iOS / iPadOS / macOS)
  for (const ks of ["com.apple.fps.1_0", "com.apple.fps"]) {
    try {
      await probe(ks, emeConfig({ initDataTypes: ["sinf", "cenc"] }));
      return {
        keySystem: ks,
        type: "fairplay",
        isHardware: true,
        name: "Apple FairPlay",
      };
    } catch {
      // Continue probe
    }
  }

  return { keySystem: "", type: "none", isHardware: false, name: "غير مدعوم (Unsupported)" };
}

/**
 * Direct Standard DRM Player Component.
 *
 * Adheres strictly to the standard EME / Shaka Player specification:
 * 1. Automatically tests device DRM capability.
 * 2. Enables ONLY the certificate/license server for the detected DRM system.
 * 3. Mounts directly to the native HTML5 <video> element without outer wrappers or floating items.
 */
export function DrmPlayer({
  manifestUrl,
  drmToken,
  licenseServers,
  clearKeys,
  initialPosition = 0,
  watermark,
  title,
  onTimeUpdate,
  onEnded,
  onPause,
  onPlay,
  onDrmDetected,
  paused,
  isFullscreen,
  onToggleFullscreen,
  children,
}: DrmPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<ShakaPlayerInstance | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [drmInfo, setDrmInfo] = useState<DeviceDrmInfo | null>(null);

  // Playback speed — remembered per browser, re-applied after Shaka attaches
  // a stream because that resets the element's playbackRate to 1.
  const [playbackRate, setPlaybackRate] = usePlaybackRate();
  useApplyPlaybackRate(videoRef, playbackRate);

  // Initialize Shaka Player Instance
  useEffect(() => {
    let isCancelled = false;
    let localPlayer: ShakaPlayerInstance | null = null;

    async function initPlayer() {
      if (!videoRef.current || !manifestUrl) return;
      setIsLoading(true);
      setErrorMsg(null);

      try {
        await loadShakaPlayerLib();
        if (isCancelled) return;

        const shaka = window.shaka;
        shaka.polyfill.installAll();

        if (!shaka.Player.isBrowserSupported()) {
          setErrorMsg("استخدم جهاز آخر أو تابلت الوزارة لأن متصفحك الحالي لا يدعم مشغل الحماية.");
          setIsLoading(false);
          return;
        }

        // 1. Check device DRM capabilities. Brave may still be installing the
        // Widevine component on first visit — retry once before giving up.
        let detected = await detectDeviceDrm();
        if (detected.type === "none" && isBraveBrowser()) {
          await new Promise((r) => setTimeout(r, 1600));
          if (isCancelled) return;
          detected = await detectDeviceDrm();
        }
        if (isCancelled) return;
        setDrmInfo(detected);
        onDrmDetected?.(detected);

        if (detected.type === "none" && !clearKeys) {
          setErrorMsg(
            isBraveBrowser()
              ? BRAVE_WIDEVINE_HELP
              : "جهازك أو متصفحك الحالي لا يدعم نظام تشفير DRM. يرجى تجربة متصفح حديث مثل Microsoft Edge أو Google Chrome."
          );
          setIsLoading(false);
          return;
        }

        // Destroy previous instance
        if (playerRef.current) {
          await playerRef.current.destroy().catch(() => {});
          playerRef.current = null;
        }

        localPlayer = new shaka.Player(videoRef.current);
        if (isCancelled) {
          await localPlayer.destroy().catch(() => {});
          return;
        }
        playerRef.current = localPlayer;

        // 2. Enable certificate and license server ONLY for the detected DRM system
        const servers: Record<string, string> = {};
        const advanced: Record<string, Record<string, unknown>> = {};
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const toAbsolute = (u?: string) => (u && u.startsWith("/") ? origin + u : u);

        if (detected.type === "playready") {
          const prServer = toAbsolute(
            toSameOriginLicense("playready", licenseServers?.playready || SAME_ORIGIN_LICENSE_SERVERS.playready)
          )!;
          servers["com.microsoft.playready"] = prServer;
          servers["com.microsoft.playready.recommendation"] = prServer;
          servers["com.microsoft.playready.recommendation.3000"] = prServer;
          advanced["com.microsoft.playready"] = {
            distinctiveIdentifierRequired: false,
            persistentStateRequired: false,
            ...(detected.robustness ? { videoRobustness: detected.robustness } : {}),
          };
          advanced["com.microsoft.playready.recommendation"] = advanced["com.microsoft.playready"];
          advanced["com.microsoft.playready.recommendation.3000"] = advanced["com.microsoft.playready"];
        } else if (detected.type === "widevine") {
          servers["com.widevine.alpha"] = toAbsolute(
            toSameOriginLicense("widevine", licenseServers?.widevine || SAME_ORIGIN_LICENSE_SERVERS.widevine)
          )!;
          // L1 keeps hardware robustness so HD stays capture-protected.
          // L3 / Brave desktop uses SW_SECURE_CRYPTO so the SD key is licensed.
          advanced["com.widevine.alpha"] = {
            distinctiveIdentifierRequired: false,
            persistentStateRequired: false,
            sessionType: "temporary",
            videoRobustness: detected.isHardware
              ? detected.robustness || "HW_SECURE_DECODE"
              : "SW_SECURE_CRYPTO",
            audioRobustness: detected.isHardware ? "HW_SECURE_CRYPTO" : "SW_SECURE_CRYPTO",
          };
        } else if (detected.type === "fairplay") {
          const fpServer = toAbsolute(
            toSameOriginLicense("fairplay", licenseServers?.fairplay || SAME_ORIGIN_LICENSE_SERVERS.fairplay)
          )!;
          servers["com.apple.fps"] = fpServer;
          servers["com.apple.fps.1_0"] = fpServer;
          if (licenseServers?.fairplayCertUrl) {
            advanced["com.apple.fps"] = {
              serverCertificateUri: toAbsolute(licenseServers.fairplayCertUrl)!,
            };
            advanced["com.apple.fps.1_0"] = {
              serverCertificateUri: toAbsolute(licenseServers.fairplayCertUrl)!,
            };
          }
        }

        localPlayer.configure({
          drm: {
            servers: Object.keys(servers).length > 0 ? servers : undefined,
            advanced: Object.keys(advanced).length > 0 ? advanced : undefined,
            clearKeys: clearKeys || undefined,
          },
          streaming: {
            bufferingGoal: 30,
            rebufferingGoal: 2,
            bufferBehind: 30,
            retryParameters: { maxAttempts: 4, baseDelay: 400, backoffFactor: 2, timeout: 20000 },
          },
        });

        // 3. Inject Axinom JWT token on license requests and same-origin media requests
        localPlayer.getNetworkingEngine().registerRequestFilter(
          (type: unknown, request: { uris?: string[]; allowCrossSiteCredentials?: boolean; headers: Record<string, string> }) => {
            const isSameOrigin = request.uris?.some((u: string) =>
              u.startsWith("/") || (typeof window !== "undefined" && u.includes(window.location.host))
            );
            if (isSameOrigin) {
              request.allowCrossSiteCredentials = true;
              if (drmToken) {
                request.headers["X-AxDRM-Message"] = drmToken;
              }
            }

            if (type === shaka.net.NetworkingEngine.RequestType.LICENSE && drmToken) {
              request.headers["X-AxDRM-Message"] = drmToken;
            }
          }
        );

        // Error handling
        localPlayer.addEventListener("error", (event: unknown) => {
          const err = (event as { detail?: { category?: number; code?: number; message?: string } })?.detail || {};
          console.error("[Shaka Player DRM Error]", err);
          setIsLoading(false);

          const brave = isBraveBrowser();

          if (err.category === shaka.util.Error.Category.NETWORK) {
            setErrorMsg(`خطأ في اتصال شبكة البث المشفر (رمز ${err.code || "1002"}). يرجى التحقق من اتصال الإنترنت.`);
          } else if (err.code === 6007 || err.code === 6008) {
            setErrorMsg(`انتهت صلاحية مفتاح الحماية أو تعذر تجديده (رمز ${err.code}). يرجى تحديث الصفحة.`);
          } else if (err.code === 6001 || err.code === 6003) {
            setErrorMsg(brave ? BRAVE_WIDEVINE_HELP : "استخدم جهاز آخر أو تابلت الوزارة لأن جهازك لا يدعم مستوى الحماية المطلوب.");
          } else if (err.code === 6006 || err.category === shaka.util.Error.Category.DRM) {
            setErrorMsg(
              brave
                ? BRAVE_WIDEVINE_HELP
                : "استخدم جهاز آخر أو تابلت الوزارة لأن جهازك لا يدعم مستوى الحماية المطلوب."
            );
          } else {
            setErrorMsg(err.message || "تعذر تشغيل الفيديو المشفر. يرجى المحاولة مرة أخرى.");
          }
        });

        // Resolve absolute manifest URL
        let resolvedManifestUrl = manifestUrl;
        if (typeof window !== "undefined" && resolvedManifestUrl.startsWith("/")) {
          resolvedManifestUrl = window.location.origin + resolvedManifestUrl;
        }

        // 4. Load encrypted stream directly
        await localPlayer.load(resolvedManifestUrl, initialPosition > 0 ? initialPosition : undefined);
        if (isCancelled) {
          await localPlayer.destroy().catch(() => {});
          return;
        }

        setIsLoading(false);

        if (initialPosition > 0 && videoRef.current && Math.abs(videoRef.current.currentTime - initialPosition) > 2) {
          videoRef.current.currentTime = initialPosition;
        }
      } catch (err: unknown) {
        if (isCancelled) return;
        console.error("[DrmPlayer] Init failed:", err);
        const errObj = err as { message?: string; name?: string; code?: number };
        const errMsgLower = (errObj?.message || "").toLowerCase();

        if (
          errObj?.name === "NotSupportedError" ||
          errMsgLower.includes("notsupported") ||
          errMsgLower.includes("unsupported keysystem")
        ) {
          setErrorMsg(isBraveBrowser() ? BRAVE_WIDEVINE_HELP : "استخدم جهاز آخر أو تابلت الوزارة لأن جهازك لا يدعم نظام التشفير الحالي.");
        } else {
          setErrorMsg(errObj?.message || "تعذر فتح البث المشفر. يرجى المحاولة مرة أخرى.");
        }
        setIsLoading(false);
      }
    }

    initPlayer();

    return () => {
      isCancelled = true;
      if (playerRef.current) {
        playerRef.current.destroy().catch(() => {});
        playerRef.current = null;
      }
      if (localPlayer && localPlayer !== playerRef.current) {
        localPlayer.destroy().catch(() => {});
      }
    };
  }, [manifestUrl, drmToken, licenseServers, clearKeys, initialPosition, retryCount]);

  // ── Silent Screen-Capture Protection (Direct Hardware-like Blackout) ───────
  useEffect(() => {
    let hideTimer: NodeJS.Timeout | null = null;

    const setVideoHidden = (hidden: boolean) => {
      if (videoRef.current) {
        videoRef.current.style.opacity = hidden ? "0" : "1";
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const k = e.key;
      const lowerK = k.toLowerCase();
      const isMeta =
        e.metaKey ||
        (typeof e.getModifierState === "function" &&
          (e.getModifierState("Meta") || e.getModifierState("OS")));

      const isPrtScn = k === "PrintScreen" || e.code === "PrintScreen" || e.keyCode === 44;
      const isKeyS = lowerK === "s" || lowerK === "س" || e.code === "KeyS" || e.keyCode === 83;
      const isWinSnipping = isMeta && e.shiftKey && isKeyS;
      const isWinGameBar = isMeta && (lowerK === "g" || lowerK === "ل");
      const isMacScreenshot = isMeta && e.shiftKey && ["3", "4", "5", "#", "$", "%"].includes(k);
      const isBrowserScreenshot = (e.ctrlKey || isMeta) && e.shiftKey && isKeyS;

      if (isPrtScn || isWinSnipping || isWinGameBar || isMacScreenshot || isBrowserScreenshot) {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          navigator.clipboard.writeText("").catch(() => {});
        }
        setVideoHidden(true);
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
          if (document.hasFocus()) {
            setVideoHidden(false);
          }
        }, 3000);
      }
    };

    const handleBlur = () => {
      const isTouch =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(pointer: coarse)").matches;
      if (!isTouch) {
        setVideoHidden(true);
      }
    };

    const handleFocus = () => {
      if (hideTimer) clearTimeout(hideTimer);
      setTimeout(() => {
        if (document.hasFocus()) {
          setVideoHidden(false);
        }
      }, 150);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    return () => {
      if (hideTimer) clearTimeout(hideTimer);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  // Sync external paused prop
  useEffect(() => {
    if (paused && videoRef.current && !videoRef.current.paused) {
      videoRef.current.pause();
    }
  }, [paused]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black flex items-center justify-center select-none"
    >
      {/* ── Direct Native HTML5 Video Element — native chrome off, VideoControlBar drives it ── */}
      <video
        ref={videoRef}
        controlsList="nodownload noplaybackrate"
        disablePictureInPicture
        playsInline
        className="w-full h-full object-contain bg-black cursor-pointer"
        onClick={(e) => {
          const v = e.currentTarget;
          if (v.paused || v.ended) void v.play().catch(() => {});
          else v.pause();
        }}
        onPlay={() => {
          setIsLoading(false);
          onPlay?.();
        }}
        onPause={() => onPause?.()}
        onEnded={() => onEnded?.()}
        onTimeUpdate={(e) => onTimeUpdate?.((e.target as HTMLVideoElement).currentTime)}
        onLoadedMetadata={() => setIsLoading(false)}
      />

      {/* Loading state indicator */}
      {isLoading && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center z-10 pointer-events-none space-y-3">
          <div className="w-12 h-12 rounded-full border-4 border-sky-500/20 border-t-sky-500 animate-spin" />
          <span className="text-xs text-gray-300 font-medium tracking-wide">
            {drmInfo ? `جارٍ تفعيل شهادة ${drmInfo.name}...` : "جارٍ فحص نظام DRM على الجهاز..."}
          </span>
        </div>
      )}

      {/* Error state */}
      {errorMsg && (
        <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20 dir-rtl">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-3 text-2xl">
            ⚠️
          </div>
          <h3 className="text-base font-bold text-white mb-2">تنبيه مشغل الفيديو المحمي</h3>
          <p className="text-xs text-slate-300 max-w-md mb-4 leading-relaxed">{errorMsg}</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setRetryCount((c) => c + 1)}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md"
            >
              إعادة المحاولة
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-all cursor-pointer"
            >
              تحديث الصفحة
            </button>
          </div>
        </div>
      )}

      {!errorMsg && (
        <VideoControlBar
          videoRef={videoRef}
          playbackRate={playbackRate}
          onPlaybackRateChange={setPlaybackRate}
          isFullscreen={isFullscreen}
          onToggleFullscreen={onToggleFullscreen}
        />
      )}

      {children}
    </div>
  );
}

export default DrmPlayer;
