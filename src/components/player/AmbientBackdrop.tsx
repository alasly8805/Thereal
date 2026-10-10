"use client";

import { useEffect, useRef, useState } from "react";
import { extractYouTubeVideoId } from "@/lib/youtube";

/**
 * "Ambient mode" for the empty space around the lesson video: a soft, blurred
 * glow in the colours of what is on screen, instead of flat black bars.
 *
 * Everything runs in the student's browser; the server does no work.
 * - Our own <video> (native / Drive stream): a 48×27 copy of the frame is drawn
 *   a few times a second and blown up with a CSS blur, so the glow follows the
 *   lesson. That is a few hundred pixels per tick, cheap even on old laptops.
 * - YouTube: the browser forbids reading another site's pixels, so the glow
 *   uses that video's thumbnail instead — its real colours, just not live.
 * - DRM or anything unreadable: a quiet brand-coloured glow.
 *
 * Only mounted where there are side bars to fill (wide screens), and it stops
 * sampling while the tab is hidden or the video is paused.
 */

const W = 48;
const H = 27;

function useWideScreen() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return wide;
}

export function AmbientBackdrop({
  stage,
  provider,
  embedUrl,
}: {
  /** Element that contains the player; the <video> is found inside it. */
  stage: HTMLElement | null;
  provider: string;
  embedUrl: string;
}) {
  const wide = useWideScreen();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);

  const youtubeId =
    provider === "youtube"
      ? extractYouTubeVideoId(embedUrl) || embedUrl.match(/\/embed\/([^?/]+)/)?.[1] || null
      : null;

  useEffect(() => {
    if (!wide || !stage || youtubeId) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const every = reduced ? 1500 : 220;
    let darkTicks = 0;
    let stopped = false;
    let drawn = false;

    const tick = () => {
      if (stopped || document.hidden) return;
      const video = stage.querySelector("video");
      if (!video || video.readyState < 2) return;
      try {
        ctx.drawImage(video, 0, 0, W, H);
        drawn = true;
      } catch {
        return;
      }
      // A protected (DRM) stream draws as solid black; after a few black
      // frames in a row, fall back to the brand glow instead of a dark box.
      try {
        const px = ctx.getImageData(0, 0, W, H).data;
        let sum = 0;
        for (let i = 0; i < px.length; i += 16) sum += px[i] + px[i + 1] + px[i + 2];
        darkTicks = sum / (px.length / 16) < 6 ? darkTicks + 1 : 0;
      } catch {
        darkTicks = 0; // unreadable but still drawn: keep showing it
      }
      setLive(darkTicks < 4);
    };

    tick();
    const id = window.setInterval(() => {
      const video = stage.querySelector("video");
      // Sample while playing, plus the first frame of a video that loads
      // paused. A paused frame is otherwise redrawn on "pause"/"seeked".
      if (video && (!video.paused || !drawn)) tick();
    }, every);
    const once = () => tick();
    const video = stage.querySelector("video");
    video?.addEventListener("seeked", once);
    video?.addEventListener("loadeddata", once);
    video?.addEventListener("pause", once);
    document.addEventListener("visibilitychange", once);
    return () => {
      stopped = true;
      window.clearInterval(id);
      video?.removeEventListener("seeked", once);
      video?.removeEventListener("loadeddata", once);
      video?.removeEventListener("pause", once);
      document.removeEventListener("visibilitychange", once);
    };
  }, [wide, stage, youtubeId, embedUrl]);

  if (!wide) return null;

  const glow = "absolute inset-0 w-full h-full scale-125 pointer-events-none";
  const blur = { filter: "blur(64px) saturate(1.5) brightness(0.85)" };

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {/* Always-there fallback: a soft brand glow, never flat black. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 80% at 15% 50%, color-mix(in srgb, var(--brand) 38%, transparent), transparent 70%)," +
            "radial-gradient(60% 80% at 85% 50%, color-mix(in srgb, var(--gold) 26%, transparent), transparent 70%), #05090f",
        }}
      />
      {youtubeId ? (
        // eslint-disable-next-line @next/next/no-img-element -- external thumbnail used only as a blurred colour source
        <img
          src={`https://i.ytimg.com/vi/${youtubeId}/mqdefault.jpg`}
          alt=""
          className={`${glow} object-cover`}
          style={blur}
          referrerPolicy="no-referrer"
        />
      ) : (
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className={`${glow} transition-opacity duration-700 motion-reduce:transition-none`}
          style={{ ...blur, opacity: live ? 1 : 0 }}
        />
      )}
      {/* Glass: darkens the glow slightly so the video stays the brightest thing. */}
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.05), transparent 30%, transparent 70%, rgba(0,0,0,0.25))" }}
      />
    </div>
  );
}
