// Minimal service worker — satisfies the PWA installability requirement.
// Do NOT register a fetch listener. Chromium CDMs (Widevine) refuse license
// requests that a service worker intercepts, which breaks DRM in Brave.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
