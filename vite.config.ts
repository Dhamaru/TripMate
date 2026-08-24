import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "robots.txt", "apple-touch-icon.png"],
      manifest: {
        name: "TripMate - Smart Travel Companion",
        short_name: "TripMate",
        description: "AI-driven travel intelligence and budgeting.",
        theme_color: "#007AFF",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
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
            // CARTO basemap tiles. CacheFirst so any tile already fetched
            // (either opportunistically while browsing, or via the explicit
            // "Download for offline" flow in OfflineMaps.tsx, which writes
            // into this exact cache name) is served offline without a
            // network round-trip. cacheName must match TILE_CACHE_NAME in
            // client/src/lib/offlineTiles.ts.
            urlPattern: /^https:\/\/[a-d]\.basemaps\.cartocdn\.com\/.*/i,
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
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Previously one ~1.7MB chunk with no vendor separation — every
        // deploy invalidated the browser's cache for the entire app,
        // including third-party code that never changes between our own
        // releases. A single vendor/app split fixes that cache-busting
        // problem safely.
        //
        // Tried splitting vendor further by package group (react-vendor,
        // radix-vendor, motion-vendor, etc.) first — it broke at runtime
        // ("Cannot set properties of undefined (setting 'Children')"),
        // caught by an actual browser load, not the build or type-check.
        // Nearly every heavy dependency here (Radix, framer-motion,
        // recharts, react-leaflet) shares React's module singleton at
        // import time; isolating react-dom into its own chunk broke the
        // load-order guarantee those packages depend on. One vendor chunk
        // preserves Rollup's natural intra-chunk ordering and still gets
        // the real win: vendor code (which rarely changes) stays cached
        // separately from app code (which changes every deploy).
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          return "vendor";
        },
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
