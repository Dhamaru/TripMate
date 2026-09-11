/// <reference lib="webworker" />
// Hand-written service worker (vite-plugin-pwa's "injectManifest" strategy)
// — replaced the auto-generated one (generateSW) because that mode has no
// hook for custom event listeners, and real push notifications need a
// `push` handler here. Everything generateSW used to build automatically
// (precaching, the 3 runtime-caching rules, the SPA navigation fallback)
// is reproduced below by hand so behavior doesn't change; only the push/
// notificationclick listeners are new. Excluded from the main tsconfig
// (no `webworker` lib there) — vite-plugin-pwa builds this file directly,
// so `vite build` is what actually validates it.
export {};
declare const self: ServiceWorkerGlobalScope;

import { clientsClaim } from "workbox-core";
import {
  cleanupOutdatedCaches,
  precacheAndRoute,
  createHandlerBoundToURL,
} from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();

// Precache manifest injection point — vite-plugin-pwa replaces this array
// at build time with every built asset's URL + revision hash.
precacheAndRoute(self.__WB_MANIFEST);

// Same denylist the old generateSW config used (vite.config.ts's history):
// /api never serves the app shell, /download is its own static page, not
// a SPA route.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("index.html"), {
    denylist: [/^\/api\//, /^\/download\//],
  }),
);

registerRoute(
  ({ url }) => url.origin === "https://api.openweathermap.org",
  new CacheFirst({
    cacheName: "weather-cache",
    plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 })],
  }),
);

registerRoute(
  ({ url }) => /\/api\/v1\/trips.*/i.test(url.pathname),
  new NetworkFirst({
    cacheName: "trips-api-cache",
    plugins: [
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

// CARTO raster tiles (Positron light + Dark Matter dark) — cacheName MUST
// match TILE_CACHE_NAME in client/src/lib/offlineTiles.ts (the explicit
// "Download for offline" flow writes into this exact cache).
registerRoute(
  ({ url }) => url.hostname.endsWith(".basemaps.cartocdn.com"),
  new CacheFirst({
    cacheName: "map-tiles-cache",
    plugins: [
      new ExpirationPlugin({ maxEntries: 6000, maxAgeSeconds: 60 * 60 * 24 * 60 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

// ── Web push ─────────────────────────────────────────────────────────
// Payload shape is set by server/push.ts: { title, body, url? }.
self.addEventListener("push", (event: PushEvent) => {
  let data: { title?: string; body?: string; url?: string } = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { title: "TripMate", body: event.data?.text() || "" };
  }
  const title = data.title || "TripMate";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      data: { url: data.url || "/" },
    }),
  );
});

// Clicking the OS notification focuses an already-open TripMate tab if
// one exists (navigating it to the notification's link), otherwise opens
// a new one — the standard pattern for every app that does this.
self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url || "/";
  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clientsList) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await (client as WindowClient).navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
