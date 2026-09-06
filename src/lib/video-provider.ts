/**
 * Unified video provider dispatcher.
 * Resolves the correct embed URL based on the video's provider field.
 */

import { getVdoCipherOtp } from "./vdocipher";
import { getBunnyEmbedUrl } from "./bunny";
import { getYouTubeEmbedUrl, extractYouTubeVideoId } from "./youtube";
import { getAlaslyPlaybackToken } from "./alasly";
import { createAxinomDrmToken } from "./axinom";

export type VideoProvider = "vdocipher" | "bunny" | "youtube" | "alasly" | "axinom";

export interface VideoEmbedResult {
  embedUrl: string;
  provider: VideoProvider;
  signed: boolean;
  expiresInSeconds: number | null;
  drm?: {
    token: string;
    licenseServers: {
      widevine: string;
      playready: string;
      fairplay: string;
      fairplayCertUrl?: string;
    };
  };
}

/** Sanitizes and extracts clean provider video ID based on provider rules */
export function cleanProviderVideoId(provider: VideoProvider, input: string): string {
  if (!input || typeof input !== "string") return "";
  const trimmed = input.trim();

  switch (provider) {
    case "youtube": {
      const extracted = extractYouTubeVideoId(trimmed);
      return extracted || trimmed;
    }
    case "bunny": {
      // If full iframe/embed URL was pasted, extract the GUID:
      // e.g. https://iframe.mediadelivery.net/embed/12345/382e703d-82d6-444a-a430-86ad178da857
      const guidMatch = trimmed.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (guidMatch) return guidMatch[0];
      return trimmed;
    }
    case "vdocipher":
    case "alasly":
    case "axinom":
    default:
      return trimmed;
  }
}

export interface ResolveEmbedOptions {
  userId?: string;
  domain?: string;
  apiKey?: string;
  playerId?: string | null;
  watermarkText?: string;
}

/**
 * Given a video record's provider + providerVideoId (with legacy vdoCipherId fallback),
 * returns a ready-to-embed URL for the player iframe.
 */
export async function resolveEmbedUrl(
  video: {
    videoProvider: string;
    providerVideoId: string;
    vdoCipherId: string;
  },
  options?: ResolveEmbedOptions
): Promise<VideoEmbedResult> {
  const provider = (video.videoProvider || "vdocipher") as VideoProvider;

  // Legacy rows have providerVideoId="" and vdoCipherId set — fall back gracefully.
  const rawId = video.providerVideoId || video.vdoCipherId;

  if (!rawId) {
    throw new Error("Video has no provider ID configured");
  }

  const id = cleanProviderVideoId(provider, rawId);

  switch (provider) {
    case "axinom": {
      const { mintAxinomTokenWithPool } = await import("./axinom-pool");
      const result = await mintAxinomTokenWithPool({
        videoId: id,
        userId: options?.userId,
      });
      return {
        embedUrl: result.manifestUrl,
        provider: "axinom",
        signed: true,
        expiresInSeconds: result.expiresInSeconds,
        drm: {
          token: result.token,
          licenseServers: result.licenseServers,
        },
      };
    }
    case "alasly": {
      const result = await getAlaslyPlaybackToken({
        videoId: id,
        userId: options?.userId,
        domain: options?.domain,
      });
      return { embedUrl: result.embedUrl, provider, signed: true, expiresInSeconds: result.expiresInSeconds };
    }
    case "bunny": {
      const result = await getBunnyEmbedUrl(id);
      return { embedUrl: result.embedUrl, provider, signed: result.signed, expiresInSeconds: result.expiresInSeconds };
    }
    case "youtube": {
      const result = getYouTubeEmbedUrl(id);
      return { embedUrl: result.embedUrl, provider, signed: false, expiresInSeconds: null };
    }
    case "vdocipher":
    default: {
      const result = await getVdoCipherOtp(id, {
        apiKey: options?.apiKey,
        playerId: options?.playerId,
        userId: options?.userId,
        watermarkText: options?.watermarkText,
      });
      return { embedUrl: result.embedUrl, provider: "vdocipher", signed: true, expiresInSeconds: 3600 };
    }
  }
}

export const PROVIDER_LABELS: Record<VideoProvider, string> = {
  axinom: "Axinom DRM (Hardware Multi-DRM)",
  vdocipher: "VdoCipher",
  bunny: "Bunny Stream",
  youtube: "YouTube Private",
  alasly: "Native (Super Native Security)",
};

/** Validates a provider ID format per provider rules */
export function validateProviderId(provider: VideoProvider, id: string): string | null {
  if (!id || !id.trim()) return "معرف الفيديو مطلوب";
  const trimmed = id.trim();

  switch (provider) {
    case "axinom":
      if (!/^[a-z0-9_.-]+$/i.test(trimmed)) return "معرف درس Axinom DRM يحتوي على أحرف وأرقام وشرطات ونقاط فقط";
      break;
    case "alasly":
      if (!/^[a-z0-9_.-]+$/i.test(trimmed)) return "معرف درس Native يحتوي على أحرف وأرقام وشرطات ونقاط فقط";
      break;
    case "vdocipher":
      if (!/^[a-z0-9_.-]+$/i.test(trimmed)) return "معرف VdoCipher يحتوي على أحرف وأرقام وشرطات ونقاط فقط";
      break;
    case "bunny": {
      const cleanBunny = cleanProviderVideoId("bunny", trimmed);
      if (!/^[a-z0-9_.-]+$/i.test(cleanBunny)) return "معرف Bunny Stream يحتوي على أحرف وأرقام وشرطات ونقاط فقط";
      break;
    }
    case "youtube": {
      const cleanYt = extractYouTubeVideoId(trimmed);
      if (!cleanYt || !/^[a-zA-Z0-9_-]{10,12}$/.test(cleanYt)) {
        return "رابط أو معرف YouTube غير صالح. يرجى إدخال رابط فيديو صالح (مثال: https://youtu.be/... أو https://youtube.com/watch?v=...) أو معرف الفيديو";
      }
      break;
    }
  }
  return null;
}
