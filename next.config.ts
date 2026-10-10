import type { NextConfig } from "next";

/**
 * Hosts the browser is allowed to talk to. Video is served from third-party
 * players inside iframes, so those hosts must be listed explicitly — a CSP that
 * blocks the player would break every lesson.
 */
const VIDEO_FRAME_HOSTS = [
  "https://www.youtube-nocookie.com",
  "https://www.youtube.com",
  "https://player.vdocipher.com",
  "https://iframe.mediadelivery.net",
  "https://*.b-cdn.net",
  "https://alasly.lovable.app",
  "https://drive.google.com",
];

const isProd = process.env.NODE_ENV === "production";
const scriptSrcDirectives = [
  "'self'",
  "'unsafe-inline'",
  ...(isProd ? [] : ["'unsafe-eval'"]),
  "https://www.google.com",
  "https://www.gstatic.com",
  "https://www.youtube.com",
  "https://s.ytimg.com",
  "https://player.vdocipher.com",
  "https://cdnjs.cloudflare.com",
  "https://connect.facebook.net",
].join(" ");

const CSP = [
  "default-src 'self'",
  // Next.js injects inline bootstrap scripts; 'unsafe-inline' stays until a
  // nonce-based setup is introduced. 'unsafe-eval' is strictly disabled in production.
  `script-src ${scriptSrcDirectives}`,
  // Google Fonts is loaded from the root layout and the parent portal
  // (Tajawal / IBM Plex Sans Arabic / Amiri / Noto Naskh Arabic). Omitting
  // these two hosts blocks every Arabic webfont on the site.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "media-src 'self' blob: https:",
  `frame-src 'self' ${VIDEO_FRAME_HOSTS.join(" ")} https://www.google.com`,
  // The encrypted HLS player (hls.js) fetches video segments from the
  // CloudFront video domain with XHR, which media-src does not cover.
  `connect-src 'self'${process.env.CLOUDFRONT_VIDEO_DOMAIN ? ` https://${process.env.CLOUDFRONT_VIDEO_DOMAIN}` : ""} https://recaptchaenterprise.googleapis.com https://www.google.com https://fonts.googleapis.com https://fonts.gstatic.com https://www.youtube.com https://www.youtube-nocookie.com https://*.googlevideo.com https://*.youtube.com https://*.axprod.net https://*.drm-widevine-licensing.axprod.net https://*.drm-playready-licensing.axprod.net https://*.drm-fairplay-licensing.axprod.net https://*.axtest.net https://drm-widevine-licensing.axtest.net https://drm-playready-licensing.axtest.net https://drm-fairplay-licensing.axtest.net https://connect.facebook.net https://www.facebook.com https://*.facebook.com`,
  // Nothing in this app should ever be framed by a third party.
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  compress: true,
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: {
    formats: ["image/avif", "image/webp"],
  },
  serverExternalPackages: ["@whiskeysockets/baileys"],
  typescript: {
    ignoreBuildErrors: true,
  },
  productionBrowserSourceMaps: false,
  allowedDevOrigins: ["localhost", "127.0.0.1", "*.app.github.dev"],
  transpilePackages: ["framer-motion", "motion-dom", "motion-utils", "axios"],

  experimental: {
    // Next.js 16 proxy buffers request bodies for every matched route. Without
    // raising this, multipart homework uploads (PDFs etc.) get truncated/corrupted
    // and the browser shows "Failed to fetch".
    proxyClientMaxBodySize: "15mb",
    serverActions: {
      allowedOrigins: ["localhost:3000", "127.0.0.1:3000", "*.app.github.dev"],
      bodySizeLimit: "15mb",
    },
  },

  redirects: async () => [
    {
      source: "/teachers",
      destination: "/courses",
      permanent: true,
    },
    // Forward Arabic standalone lesson to Arabic month course
    {
      source: "/courses/cmtqbw41d005qqwobfcrfg07c",
      destination: "/courses/cmtqhrxrh0013qw6iec0ikr89",
      permanent: false,
    },
    {
      source: "/courses/cmtqbw41d005qqwobfcrfg07c/learn",
      destination: "/courses/cmtqhrxrh0013qw6iec0ikr89/learn",
      permanent: false,
    },
    // Forward Languages standalone lesson to Languages month course
    {
      source: "/courses/cmtr54unr00wfqwwvtbvaxy8q",
      destination: "/courses/cmtr5aiko00zkqwwv03ucyju7",
      permanent: false,
    },
    {
      source: "/courses/cmtr54unr00wfqwwvtbvaxy8q/learn",
      destination: "/courses/cmtr5aiko00zkqwwv03ucyju7/learn",
      permanent: false,
    },
    // Forward Youssef El-Tareq Languages standalone lesson to Month 1 Programming Languages
    {
      source: "/courses/cmta9me5r0007qxmwnnsq1cez",
      destination: "/courses/cmtaozekq0022qxrwfwjpxcyp",
      permanent: false,
    },
    {
      source: "/courses/cmta9me5r0007qxmwnnsq1cez/learn",
      destination: "/courses/cmtaozekq0022qxrwfwjpxcyp/learn",
      permanent: false,
    },
    // Forward Youssef El-Tareq Arabic standalone lesson to Month 1 Programming Arabic
    {
      source: "/courses/cmt45qxsf001oqx3e9jtlwny8",
      destination: "/courses/cmt45u9p9001pqx3qos4rpxpx",
      permanent: false,
    },
    {
      source: "/courses/cmt45qxsf001oqx3e9jtlwny8/learn",
      destination: "/courses/cmt45u9p9001pqx3qos4rpxpx/learn",
      permanent: false,
    },
  ],

  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Content-Security-Policy", value: CSP },
        // Parent-portal links carry their token in the path, so the full URL
        // must never travel in a Referer header to a third-party host.
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        {
          key: "Permissions-Policy",
          // autoplay=(self) blocked YouTube/VdoCipher iframes from ever starting
          // (playVideo() from the parent is treated as cross-origin autoplay).
          // encrypted-media stays allowed for same-origin Axinom and iframe DRM.
          value: 'encrypted-media=(self "https://www.youtube.com" "https://www.youtube-nocookie.com" "https://player.vdocipher.com"), autoplay=(self "https://www.youtube.com" "https://www.youtube-nocookie.com" "https://player.vdocipher.com" "https://iframe.mediadelivery.net" "https://drive.google.com" "https://alasly.lovable.app"), camera=(), microphone=(), geolocation=(), payment=(), display-capture=()',
        },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      ],
    },
    {
      // The parent portal is reached from a WhatsApp link; suppress the Referer
      // entirely so the token cannot leak to any outbound navigation.
      source: "/p/:token",
      headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
    },
  ],
};

export default nextConfig;
