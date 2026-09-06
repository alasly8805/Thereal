"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Maximize, Settings, AlertTriangle, ShieldCheck, Tablet } from "lucide-react";
import { VideoWatermark } from "./VideoWatermark";

interface ShakaPlayerInstance {
  destroy: () => Promise<void>;
  addEventListener: (event: string, handler: (e?: { detail?: { category?: number; code?: number } }) => void) => void;
  getKeyStatuses?: () => Record<string, string>;
  configure: (config: unknown) => void;
  getNetworkingEngine: () => {
    registerRequestFilter: (
      filter: (
        type: unknown,
        request: { uris?: string[]; allowCrossSiteCredentials?: boolean; headers: Record<string, string> }
      ) => void
    ) => void;
  };
  load: (manifestUri: string) => Promise<void>;
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
  paused?: boolean;
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
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/shaka-player/4.7.11/shaka-player.compiled.js";
    script.async = true;

    const onLoad = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      shakaLoadPromise = null;
      reject(new Error("تعذر تحميل مشغل الحماية Shaka Player"));
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


/** Cheap EME capability probe: does this device offer the requested robustness? */
async function supportsRobustness(
  keySystem: string,
  videoRobustness: string,
  audioRobustness: string
): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.requestMediaKeySystemAccess) return false;
  try {
    await navigator.requestMediaKeySystemAccess(keySystem, [
      {
        initDataTypes: ["cenc"],
        videoCapabilities: [
          { contentType: 'video/mp4; codecs="avc1.42E01E"', robustness: videoRobustness },
        ],
        audioCapabilities: [
          { contentType: 'audio/mp4; codecs="mp4a.40.2"', robustness: audioRobustness },
        ],
      },
    ]);
    return true;
  } catch {
    return false;
  }
}

/** PlayReady hardware DRM (SL3000) is exposed under its own key system on Edge. */
const PLAYREADY_HW = "com.microsoft.playready.recommendation.3000";
/** Edge more commonly exposes hardware PlayReady here, with robustness "3000". */
const PLAYREADY_HW_ALT = "com.microsoft.playready.recommendation";
const PLAYREADY_SW = "com.microsoft.playready";

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
  paused,
}: DrmPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<ShakaPlayerInstance | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // ── Controls Auto-hide Timer ───────────────────────────────────────────────
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
        setShowSettings(false);
      }, 3500);
    }
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
        setShowSettings(false);
      }, 3500);
    }
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isPlaying]);

  // ── Fullscreen state synchronizer ──────────────────────────────────────────
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const [isBlackoutActive, setIsBlackoutActive] = useState(false);
  // Distinct from the transient blackout: this one is driven by the CDM and
  // stays up for as long as the platform reports an unprotected output path.
  const [outputRestricted, setOutputRestricted] = useState(false);

  // Remote playback and picture-in-picture both hand the decoded frames to a
  // surface this player no longer controls, so they are refused outright.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    try {
      (video as HTMLVideoElement & { disableRemotePlayback?: boolean }).disableRemotePlayback = true;
      video.setAttribute("disablePictureInPicture", "");
    } catch {
      /* not supported everywhere */
    }
    const blockPip = (event: Event) => event.preventDefault();
    video.addEventListener("enterpictureinpicture", blockPip);
    return () => video.removeEventListener("enterpictureinpicture", blockPip);
  }, []);

  // ── Anti-Screenshot & Screen-Recording Blackout Engine ─────────────────────
  useEffect(() => {
    let blackoutTimer: NodeJS.Timeout | null = null;

    // Visibility, not focus. document.hasFocus() is false on mobile in ordinary
    // use (address bar, keyboard, notification shade), and gating the *release*
    // on it latched the blackout on permanently — the video simply stayed black.
    // visibilityState is the signal that actually tracks "the user can see this".
    const isVisible = () =>
      typeof document === "undefined" || document.visibilityState === "visible";

    // Touch devices fire blur constantly, including when tapping the player's own
    // controls, so blur is not a usable capture signal there. visibilitychange
    // still covers backgrounding, which is the case that matters.
    const isTouchDevice =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;

    const triggerBlackout = (durationMs = 2500) => {
      setIsBlackoutActive(true);
      try {
        if (videoRef.current && !videoRef.current.paused) {
          videoRef.current.pause();
        }
      } catch {
        /* best effort pause */
      }
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        navigator.clipboard.writeText("").catch(() => {});
      }
      if (blackoutTimer) clearTimeout(blackoutTimer);
      blackoutTimer = setTimeout(() => {
        if (isVisible()) {
          setIsBlackoutActive(false);
        }
      }, durationMs);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const k = e.key;
      const lowerK = k.toLowerCase();

      const isPrtScn = k === "PrintScreen" || e.code === "PrintScreen" || e.keyCode === 44;
      const isMeta =
        e.metaKey ||
        (typeof e.getModifierState === "function" &&
          (e.getModifierState("Meta") || e.getModifierState("OS")));

      const isWinSnipping = isMeta && e.shiftKey && lowerK === "s";
      const isWinGameBar = isMeta && lowerK === "g";
      const isMacScreenshot = isMeta && e.shiftKey && ["3", "4", "5", "#", "$", "%"].includes(k);
      const isBrowserScreenshot = (e.ctrlKey || isMeta) && e.shiftKey && lowerK === "s";
      const isDevTools =
        k === "F12" ||
        ((e.ctrlKey || isMeta) && e.shiftKey && (lowerK === "i" || lowerK === "j" || lowerK === "c")) ||
        ((e.ctrlKey || isMeta) && lowerK === "u");

      if (isPrtScn || isWinSnipping || isWinGameBar || isMacScreenshot || isBrowserScreenshot) {
        e.preventDefault();
        e.stopPropagation();
        triggerBlackout(2500);
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          navigator.clipboard.writeText("").catch(() => {});
        }
      } else if (isDevTools) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen" || e.code === "PrintScreen" || e.keyCode === 44) {
        e.preventDefault();
        e.stopPropagation();
        triggerBlackout(2500);
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          navigator.clipboard.writeText("").catch(() => {});
        }
      }
    };

    const handleBlur = () => {
      // When an external screen capture or snipping tool steals focus while playing,
      // black out the video instantly to prevent capturing frames.
      if (videoRef.current && !videoRef.current.paused) {
        triggerBlackout(2500);
      }
    };

    const handleFocus = () => {
      if (blackoutTimer) clearTimeout(blackoutTimer);
      setIsBlackoutActive(false);
    };

    const handlePointerActivity = () => {
      if (document.hasFocus()) {
        setIsBlackoutActive(false);
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        triggerBlackout(2000);
      } else {
        handleFocus();
      }
    };

    // Safety net: if anything above latched the blackout while the page is
    // visible, release it rather than leaving a permanently black player.
    const stuckGuard = setInterval(() => {
      if (isVisible() && document.hasFocus()) {
        setIsBlackoutActive(false);
      }
    }, 3000);

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("mousemove", handlePointerActivity, { passive: true });
    if (!isTouchDevice) window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (blackoutTimer) clearTimeout(blackoutTimer);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("mousemove", handlePointerActivity);
      window.removeEventListener("blur", handleBlur);
      clearInterval(stuckGuard);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);


  // ── Initialize Shaka Player Instance ───────────────────────────────────────
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
          setErrorMsg("استخدم جهاز اخر او تابلت الوزاره لان جهازك غير مدعوم");
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

        // The only trustworthy "this screen is being captured" signal available
        // to a web page. When the platform cannot guarantee a protected output
        // path - capture card, mirrored/duplicated display, some recorders and
        // VMs - the CDM downgrades the key to output-restricted (or
        // output-downscaled) instead of decrypting to the screen.
        localPlayer.addEventListener("keystatuschanged", () => {
          try {
            const statuses = Object.values(localPlayer.getKeyStatuses?.() || {});
            if (!statuses.length) return;
            // With tiered keys a software device is legitimately refused the HD
            // key while the SD key stays usable, and Shaka just drops the HD
            // renditions. Only lock the screen when NO key is usable, which is
            // the real "this output cannot be protected at all" case.
            const anyUsable = statuses.some((status) => status === "usable");
            const anyRestricted = statuses.some(
              (status) => status === "output-restricted" || status === "output-downscaled"
            );
            const restricted = anyRestricted && !anyUsable;
            setOutputRestricted(restricted);
            if (restricted) {
              try {
                videoRef.current?.pause();
              } catch {
                /* pausing is best effort */
              }
            }
          } catch {
            /* key status is advisory; never break playback reading it */
          }
        });

        // Configure DRM Key Systems
        const servers: Record<string, string> = {};
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const toAbsolute = (u?: string) => (u && u.startsWith("/") ? origin + u : u);

        // Ask for the hardware-backed CDM first and only fall back to software
        // when the device genuinely cannot provide it. This matters more than
        // anything else in this file: a software CDM never engages the OS
        // protected media path, so the captured frame is never blank. On
        // Windows the only desktop browser that can give a black capture is
        // Edge via PlayReady SL3000, which is exposed as its own key system.
        const widevineHardware = await supportsRobustness(
          "com.widevine.alpha",
          "HW_SECURE_ALL",
          "HW_SECURE_CRYPTO"
        );
        // Probe both hardware spellings before giving up on the protected path:
        // testing only the ".3000" suffix form reports "software only" on Edge
        // builds that expose hardware PlayReady under the plain recommendation
        // key system, which silently throws away the black-frame path.
        const playreadyHwExact = await supportsRobustness(PLAYREADY_HW, "3000", "3000");
        const playreadyHwAlt =
          !playreadyHwExact && (await supportsRobustness(PLAYREADY_HW_ALT, "3000", "3000"));
        const playreadyHardware = playreadyHwExact || playreadyHwAlt;
        const playreadyKeySystem = playreadyHwExact
          ? PLAYREADY_HW
          : playreadyHwAlt
            ? PLAYREADY_HW_ALT
            : PLAYREADY_SW;

        if (licenseServers?.widevine) servers["com.widevine.alpha"] = toAbsolute(licenseServers.widevine)!;
        if (licenseServers?.playready) servers[playreadyKeySystem] = toAbsolute(licenseServers.playready)!;
        if (licenseServers?.fairplay) servers["com.apple.fps.1_0"] = toAbsolute(licenseServers.fairplay)!;

        // Robustness here is the *minimum* the client asks for, so it must stay
        // permissive: demanding HW_SECURE_ALL makes an L3 device fail to create
        // a session at all, which would defeat the tiered setup. The device
        // reports its real security level in the license challenge, and Axinom
        // decides per key which tiers to issue — so an L1 device still gets HD.
        // Strict mode is the opt-out: hardware or nothing, no SD fallback.
        const requireHardware = process.env.NEXT_PUBLIC_DRM_REQUIRE_HARDWARE === "true";
        if (requireHardware && !widevineHardware && !playreadyHardware) {
          setErrorMsg("استخدم جهاز اخر او تابلت الوزاره لان جهازك غير مدعوم");
          setIsLoading(false);
          return;
        }

        const useWidevineHardware = widevineHardware;
        const advanced: Record<string, Record<string, unknown>> = {
          "com.widevine.alpha": {
            videoRobustness: useWidevineHardware ? "HW_SECURE_ALL" : "SW_SECURE_CRYPTO",
            audioRobustness: useWidevineHardware ? "HW_SECURE_CRYPTO" : "SW_SECURE_CRYPTO",
          },
          [playreadyKeySystem]: {
            videoRobustness: playreadyHardware ? "3000" : "2000",
          },
        };
        if (licenseServers?.fairplayCertUrl) {
          advanced["com.apple.fps.1_0"] = {
            serverCertificateUri: toAbsolute(licenseServers.fairplayCertUrl)!,
          };
        }

        localPlayer.configure({
          drm: {
            servers: Object.keys(servers).length > 0 ? servers : undefined,
            preferredKeySystems: [
              playreadyKeySystem,
              PLAYREADY_HW,
              PLAYREADY_HW_ALT,
              PLAYREADY_SW,
              "com.apple.fps.1_0",
              "com.widevine.alpha",
            ],
            clearKeys: clearKeys || undefined,
            advanced,
          },
          streaming: {
            bufferingGoal: 30,
            rebufferingGoal: 2,
            bufferBehind: 30,
          },
        });

        // Injects credentials and Axinom JWT Token on License requests
        localPlayer.getNetworkingEngine().registerRequestFilter((type: unknown, request: { uris?: string[]; allowCrossSiteCredentials?: boolean; headers: Record<string, string> }) => {
          // Only send credentials (cookies) to same-origin API routes to avoid CORS wildcard rejection on external CDNs
          const isSameOrigin = request.uris?.some((u: string) =>
            u.startsWith("/") || (typeof window !== "undefined" && u.includes(window.location.host))
          );
          if (isSameOrigin) {
            request.allowCrossSiteCredentials = true;
          }

          if (type === shaka.net.NetworkingEngine.RequestType.LICENSE && drmToken) {
            request.headers["X-AxDRM-Message"] = drmToken;
          }
        });

        // Error handler
        localPlayer.addEventListener("error", (event: unknown) => {
          const err = (event as { detail?: { category?: number; code?: number } })?.detail || {};
          console.error("[Shaka Player DRM Error]", err);
          setIsLoading(false);
          const isBrave =
            typeof (navigator as unknown as { brave?: unknown }).brave !== "undefined" ||
            Boolean((window as unknown as { navigator?: { brave?: unknown } }).navigator?.brave);

          if (err.category === shaka.util.Error.Category.DRM) {
            if (isBrave) {
              setErrorMsg(
                "متصفح Brave يحظر نظام Widevine DRM افتراضياً. يرجى تفعيل Widevine من إعدادات المتصفح، أو استخدم جهاز اخر او تابلت الوزاره لان جهازك غير مدعوم."
              );
            } else {
              setErrorMsg("استخدم جهاز اخر او تابلت الوزاره لان جهازك غير مدعوم");
            }
          } else if (
            err.code === 6001 ||
            err.code === 6002 ||
            err.code === 6003 ||
            err.code === 6006 ||
            err.code === 6007 ||
            err.code === 6012
          ) {
            setErrorMsg("استخدم جهاز اخر او تابلت الوزاره لان جهازك غير مدعوم");
          } else if (err.category === shaka.util.Error.Category.NETWORK) {
            setErrorMsg(`خطأ في شبكة البث المشفر (رمز ${err.code || "1002"})`);
          } else {
            setErrorMsg("استخدم جهاز اخر او تابلت الوزاره لان جهازك غير مدعوم");
          }
        });

        // Load encrypted manifest with absolute URL
        let resolvedManifestUrl = manifestUrl;
        if (typeof window !== "undefined" && resolvedManifestUrl.startsWith("/")) {
          resolvedManifestUrl = window.location.origin + resolvedManifestUrl;
        }

        await (localPlayer as any).load(resolvedManifestUrl, initialPosition > 0 ? initialPosition : undefined);
        if (isCancelled) {
          await localPlayer.destroy().catch(() => {});
          return;
        }

        setIsLoading(false);

        // Fallback seek to initial position if player.load start time was not applied
        if (initialPosition > 0 && videoRef.current && Math.abs(videoRef.current.currentTime - initialPosition) > 2) {
          videoRef.current.currentTime = initialPosition;
        }
      } catch (err: unknown) {
        if (isCancelled) return;
        console.error("[DrmPlayer] Init failed:", err);
        const errObj = err as { message?: string; name?: string; code?: number };
        const errMsgLower = (errObj?.message || "").toLowerCase();
        const isDrmOrMobile =
          errObj?.name === "NotSupportedError" ||
          errMsgLower.includes("drm") ||
          errMsgLower.includes("widevine") ||
          errMsgLower.includes("supported") ||
          errMsgLower.includes("key") ||
          (typeof window !== "undefined" &&
            (/Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
             window.innerWidth <= 768));

        if (isDrmOrMobile) {
          setErrorMsg("استخدم جهاز اخر او تابلت الوزاره لان جهازك غير مدعوم");
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

  // ── Sync Paused Prop ───────────────────────────────────────────────────────
  useEffect(() => {
    if (paused && videoRef.current && !videoRef.current.paused) {
      videoRef.current.pause();
    }
  }, [paused]);

  // ── Controls & Event Handlers ──────────────────────────────────────────────
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const current = videoRef.current.currentTime;
    setCurrentTime(current);
    onTimeUpdate?.(current);
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration || 0);
    setIsLoading(false);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const seekRelative = (seconds: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds));
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    videoRef.current.muted = nextMuted;
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      setIsMuted(val === 0);
    }
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackRate(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    setShowSettings(false);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    return `${mins}:${remainingSecs < 10 ? "0" : ""}${remainingSecs}`;
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={resetControlsTimer}
      onClick={resetControlsTimer}
      // Intentionally NOT rounded/overflow-hidden: clipping the video to a
      // radius forces a masked composite, which defeats the hardware overlay
      // plane exactly like opacity/filter does, and with it the black-frame
      // protection. Cosmetic rounding belongs on an ancestor that does not
      // contain the video surface.
      className="relative w-full aspect-video bg-black shadow-2xl border border-slate-800 select-none group"
      style={{ WebkitUserSelect: "none" }}
    >
      {/* ── HTML5 Video Element with CDM Hook ── */}
      <video
        ref={videoRef}
        playsInline
        onPlay={() => {
          setIsPlaying(true);
          setIsLoading(false);
          onPlay?.();
        }}
        onPause={() => {
          setIsPlaying(false);
          onPause?.();
        }}
        onLoadedData={() => setIsLoading(false)}
        onCanPlay={() => setIsLoading(false)}
        onPlaying={() => setIsLoading(false)}
        onWaiting={() => setIsLoading(true)}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={onEnded}
        onClick={togglePlay}
        // No filter/opacity/transition on the video element, deliberately.
        //
        // Hardware DRM only blanks a screen recorder while the frames travel the
        // overlay/direct-composition path and never enter compositor texture
        // memory. Any blending requirement here — opacity, filter, or a CSS
        // transition covering them — forces the compositor to fall back to a
        // normal texture, which a recorder can read. Hiding the video this way
        // was cancelling the protection it was meant to add. The blackout and
        // output-restricted states are drawn as sibling overlays below instead.
        className="w-full h-full object-contain cursor-pointer"
      />

      {/* ── Active Anti-Screenshot / Blur Blackout Barrier ── */}
      {isBlackoutActive && !outputRestricted && (
        <div className="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center gap-3 select-none pointer-events-auto">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 animate-pulse">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold text-white tracking-wide">تم تعتيم الشاشة لحماية المحتوى</p>
          <p className="text-xs text-slate-400 font-mono">Screen Capture Protected</p>
        </div>
      )}

      {/* ── Protected-output lock (raised by the CDM, not by key guessing) ── */}
      {outputRestricted && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black px-6 text-center">
          <ShieldCheck className="h-10 w-10 text-red-400" />
          <p className="text-base font-bold text-white">تم إيقاف العرض مؤقتًا</p>
          <p className="max-w-md text-sm leading-relaxed text-slate-300">
            تعذر تأمين مسار العرض على هذا الجهاز. أوقف أي برنامج تسجيل للشاشة أو مشاركة
            للشاشة، وافصل الشاشات المكرّرة أو أجهزة الالتقاط، ثم أعد تشغيل الدرس.
          </p>
        </div>
      )}

      {/* ── Unified Forensic Watermark ── */}
      <VideoWatermark label={watermark} />

      {/* ── Loading Spinner ── */}
      {isLoading && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center z-30 space-y-3">
          <div className="w-12 h-12 rounded-full border-4 border-sky-500/20 border-t-sky-500 animate-spin" />
        </div>
      )}

      {/* ── Error Screen ── */}
      {errorMsg && (
        <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-40 dir-rtl">
          {errorMsg.includes("استخدم جهاز اخر او تابلت الوزاره") ? (
            <div className="flex flex-col items-center max-w-md w-full animate-in fade-in zoom-in duration-300">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4 shadow-lg shadow-amber-500/10">
                <Tablet className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-black text-white mb-2">تنبيه توافق الجهاز (DRM)</h3>
              <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-4 w-full mb-5 shadow-inner text-center">
                <p className="text-sm md:text-base font-black text-amber-300 leading-relaxed">
                  استخدم جهاز اخر او تابلت الوزاره لان جهازك غير مدعوم
                </p>
                <p className="text-xs text-slate-300 mt-2.5 leading-relaxed">
                  هذا الدرس محمي بأحدث تقنيات التشفير العتادية العالمية (DRM)، وبعض معالجات الهواتف لا تدعم هذا المستوى الأمني. يمكنك المتابعة بدون أي مشكلة من تابلت المدرسة أو أي جهاز كمبيوتر أو لابتوب.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setRetryCount((c) => c + 1)}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all cursor-pointer border border-slate-700"
                >
                  إعادة المحاولة
                </button>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all cursor-pointer"
                >
                  تحديث الصفحة
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-4">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-white mb-2">تعذر تشغيل الفيديو المحمي</h3>
              <p className="text-xs text-slate-400 max-w-sm mb-5 leading-relaxed">{errorMsg}</p>
              <button
                type="button"
                onClick={() => setRetryCount((c) => c + 1)}
                className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all cursor-pointer"
              >
                إعادة المحاولة
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Top Bar Overlay (Title) ── */}
      {title && (
        <div
          className={`absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between z-20 transition-opacity duration-300 ${
            showControls ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-white/90 truncate max-w-md">{title}</span>
          </div>
        </div>
      )}

      {/* ── Bottom Controls Bar ── */}
      <div
        className={`absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent z-20 transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Progress Bar */}
        <div className="relative mb-3 flex items-center">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1.5 bg-slate-700/80 rounded-lg appearance-none cursor-pointer accent-sky-500 hover:h-2 transition-all"
          />
        </div>

        <div className="flex items-center justify-between text-white text-xs">
          {/* Right side controls (RTL) */}
          <div className="flex items-center gap-3">
            <button onClick={togglePlay} className="p-1.5 hover:text-sky-400 transition-colors cursor-pointer">
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
            </button>

            <button onClick={() => seekRelative(-10)} className="p-1.5 hover:text-sky-400 transition-colors cursor-pointer" title="تراجع 10 ثواني">
              <RotateCcw className="w-4 h-4" />
            </button>

            <button onClick={() => seekRelative(10)} className="p-1.5 hover:text-sky-400 transition-colors cursor-pointer" title="تقديم 10 ثواني">
              <RotateCw className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1.5 group/vol">
              <button onClick={toggleMute} className="p-1.5 hover:text-sky-400 transition-colors cursor-pointer">
                {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500 opacity-0 group-hover/vol:opacity-100 transition-opacity"
              />
            </div>

            <span className="text-[11px] font-mono text-slate-300">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          {/* Left side controls */}
          <div className="flex items-center gap-3 relative">
            {/* Speed Selector */}
            <div className="relative">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="px-2 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              >
                <span>{playbackRate}x</span>
                <Settings className="w-3.5 h-3.5" />
              </button>

              {showSettings && (
                <div className="absolute bottom-full mb-2 left-0 bg-slate-900 border border-slate-800 rounded-xl p-1 shadow-2xl flex flex-col min-w-[80px] z-30">
                  {[0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => (
                    <button
                      key={rate}
                      onClick={() => handleSpeedChange(rate)}
                      className={`px-3 py-1.5 text-xs text-right rounded-lg transition-colors cursor-pointer ${
                        playbackRate === rate ? "bg-sky-600 text-white font-bold" : "text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Fullscreen Button */}
            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? "إنهاء ملء الشاشة" : "ملء الشاشة"}
              className="p-1.5 hover:text-sky-400 transition-colors cursor-pointer"
            >
              <Maximize className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DrmPlayer;

