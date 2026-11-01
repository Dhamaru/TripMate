import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // Switched from the auto-generated service worker (generateSW) to a
      // hand-written one (injectManifest) so it can carry real `push` /
      // `notificationclick` listeners for web-push notifications —
      // generateSW's workbox config has no hook for custom event handlers.
      // Registration (main.tsx's registerSW/updateSW, the "Check for
      // updates" button) is unchanged — that API is identical either way.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectManifest: {
        // The precache manifest must accept the larger chunks instead of
        // silently dropping them from the offline cache.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      includeAssets: ["apple-touch-icon.png", "robots.txt"],
      // Single manifest source (the old hand-written client/public/manifest.json
      // + its hard-coded <link> in index.html were removed). Real PNG icons of
      // the gradient-circle mark so the install prompt shows the logo, not "T".
      manifest: {
        name: "TripMate — Smart Travel Companion",
        short_name: "TripMate",
        description: "AI trip planning, budgeting, offline maps, and a travel assistant.",
        id: "/",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait-primary",
        theme_color: "#0a121c",
        background_color: "#0a121c",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//, /^\/download\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.openweathermap\.org\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "weather-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
            },
          },
          {
            urlPattern: /\/api\/v1\/trips.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "trips-api-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 1 week
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // MapTiler raster tiles. CacheFirst so any tile already
            // fetched (opportunistically while browsing, or via the explicit
            // "Download for offline" flow in OfflineMaps.tsx, which writes
            // into this exact cache name) is served offline without a network
            // round-trip. cacheName must match TILE_CACHE_NAME in
            // client/src/lib/offlineTiles.ts.
            urlPattern: /^https:\/\/api\.maptiler\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "map-tiles-cache",
              expiration: {
                maxEntries: 6000,
                maxAgeSeconds: 60 * 60 * 24 * 60, // 60 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // No manualChunks: Rollup's default splitting keeps recharts, leaflet,
        // dnd-kit etc. in the lazy routes that use them. A catch-all "vendor"
        // chunk made every page load 1.8MB. Don't isolate react-dom into its own
        // chunk either: that broke at runtime ("Cannot set properties of
        // undefined (setting 'Children')"), caught only by a real browser load.
      },
    },
    chunkSizeWarningLimit: 800,
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://0.0.0.0:5000",
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
