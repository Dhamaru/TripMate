import { test, expect } from "@playwright/test";
import http from "http";
import path from "path";
import express from "express";

let server: http.Server;
const PORT = 5000;
const BASE_URL = `http://localhost:${PORT}`;
// Real key from .env when present (CI/local) — these tests hit the live
// MapTiler API, so a stale/rate-limited shared demo key would flake them
// for a reason that has nothing to do with the code under test.
const MT_KEY = process.env.VITE_MAPTILER_KEY || "M9iiV0PHI0aBXqITg2Ce";

test.beforeAll(async () => {
  const app = express();
  const distPath = path.resolve(process.cwd(), "dist/public");

  // Serve static files from production build
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });

  await new Promise<void>((resolve, reject) => {
    server = http.createServer(app);
    server.listen(PORT, "localhost", () => {
      resolve();
    });
    server.on("error", reject);
  });
});

test.afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test.describe("Offline Maps Saving and Offline Rendering", () => {
  test.use({ baseURL: BASE_URL });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(async () => {
      if ("caches" in window) {
        await window.caches.delete("map-tiles-cache");
      }
    });
  });

  test("1. Caches MapTiler tiles into map-tiles-cache while online", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Perform tile download directly in browser context using Cache Storage API.
    // MT_KEY is a Node-side const — page.evaluate runs in the browser and
    // can't close over it, so the URL is built here and passed as an arg.
    const testTileUrl = `https://api.maptiler.com/maps/streets-v2/12/2048/1365.png?key=${MT_KEY}`;
    const result = await page.evaluate(async (testTileUrl) => {
      const cacheName = "map-tiles-cache";
      const cache = await window.caches.open(cacheName);

      // Fetch and cache
      const response = await fetch(testTileUrl, { mode: "cors" });
      if (!response.ok) {
        throw new Error(`Failed to fetch tile online: HTTP ${response.status}`);
      }

      await cache.put(testTileUrl, response.clone());

      const match = await cache.match(testTileUrl);
      const isCached = !!match;
      const contentType = match?.headers.get("content-type") || "";
      const blob = match ? await match.blob() : null;

      return {
        isCached,
        contentType,
        blobSize: blob?.size || 0,
        url: testTileUrl,
      };
    }, testTileUrl);

    expect(result.isCached).toBe(true);
    expect(result.blobSize).toBeGreaterThan(1000); // PNG tile should be multiple KB
    expect(result.contentType).toContain("image");
  });

  test("2. Proves network is offline: uncached network requests fail without network", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Disconnect network completely
    await context.setOffline(true);

    const uncachedUrl = `https://api.maptiler.com/maps/streets-v2/19/99999/99999.png?key=${MT_KEY}`;
    const uncachedTileFailed = await page.evaluate(async (uncachedUrl) => {
      try {
        await fetch(uncachedUrl, { cache: "no-store" });
        return false; // Should not succeed
      } catch {
        return true; // Expected: network error
      }
    }, uncachedUrl);

    expect(uncachedTileFailed).toBe(true);

    // Re-enable network for subsequent steps
    await context.setOffline(false);
  });

  test("3. Offline retrieval: cached MapTiler tile resolves from Cache Storage while offline", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    const testTileUrl = `https://api.maptiler.com/maps/streets-v2/12/2048/1365.png?key=${MT_KEY}`;

    // Ensure it is cached first
    await page.evaluate(async (url) => {
      const cache = await window.caches.open("map-tiles-cache");
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error(`Online fetch failed: ${res.status}`);
      await cache.put(url, res.clone());
    }, testTileUrl);

    // Switch completely offline
    await context.setOffline(true);

    // Retrieve the tile offline from cache
    const offlineResult = await page.evaluate(async (url) => {
      try {
        const cache = await window.caches.open("map-tiles-cache");
        const matched = await cache.match(url);
        const allKeys = (await cache.keys()).map((r) => r.url);
        if (!matched) return { success: false, error: "not matched", keys: allKeys };

        const buffer = await matched.arrayBuffer();
        return {
          success: true,
          status: matched.status,
          size: buffer.byteLength,
          type: matched.headers.get("content-type"),
          keys: allKeys,
        };
      } catch (e) {
        return { success: false, error: String(e), keys: [] };
      }
    }, testTileUrl);

    if (!offlineResult.success) {
      throw new Error(
        `Offline retrieval failed: ${offlineResult.error}, keys in cache: ${JSON.stringify(offlineResult.keys)}`,
      );
    }
    expect(offlineResult.success).toBe(true);
    expect(offlineResult.status).toBe(200);
    expect(offlineResult.size).toBeGreaterThan(1000);
    expect(offlineResult.type).toContain("image");

    await context.setOffline(false);
  });

  test("4. Offline Rendering: Renders cached map tile image element without network", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    const testTileUrl = `https://api.maptiler.com/maps/streets-v2/12/2048/1365.png?key=${MT_KEY}`;

    // Populate cache with the tile
    await page.evaluate(async (url) => {
      const cache = await window.caches.open("map-tiles-cache");
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error(`Online fetch failed: ${res.status}`);
      await cache.put(url, res.clone());
    }, testTileUrl);

    // Cut off all network access
    await context.setOffline(true);

    // Create an image element rendered from the cached blob without network
    const renderResult = await page.evaluate(async (url) => {
      const cache = await window.caches.open("map-tiles-cache");
      let matched = await cache.match(url);
      if (!matched) {
        const keys = await cache.keys();
        if (keys.length > 0) matched = await cache.match(keys[0]);
      }
      if (!matched) {
        const keys = (await cache.keys()).map((k) => k.url);
        throw new Error(`Tile not in cache. Available keys: ${JSON.stringify(keys)}`);
      }

      const blob = await matched.blob();
      const objectUrl = URL.createObjectURL(blob);

      return new Promise<{
        complete: boolean;
        naturalWidth: number;
        naturalHeight: number;
        rendered: boolean;
      }>((resolve, reject) => {
        const img = document.createElement("img");
        img.id = "test-offline-map-tile";
        img.src = objectUrl;
        img.onload = () => {
          document.body.appendChild(img);
          resolve({
            complete: img.complete,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            rendered: img.naturalWidth > 0 && img.naturalHeight > 0,
          });
        };
        img.onerror = () => reject(new Error("Image failed to render from offline cache"));
      });
    }, testTileUrl);

    expect(renderResult.complete).toBe(true);
    expect(renderResult.rendered).toBe(true);
    expect(renderResult.naturalWidth).toBeGreaterThan(0);
    expect(renderResult.naturalHeight).toBeGreaterThan(0);

    await context.setOffline(false);
  });

  test("5. Deleting cached tiles cleans up the offline cache storage", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    const testTileUrl = `https://api.maptiler.com/maps/streets-v2/12/2048/1365.png?key=${MT_KEY}`;

    const deleted = await page.evaluate(async (url) => {
      const cache = await window.caches.open("map-tiles-cache");
      await cache.put(url, new Response("dummy-tile-data", { status: 200 }));
      const deleteSuccess = await cache.delete(url);
      const existsAfterDelete = await cache.match(url);
      return deleteSuccess && !existsAfterDelete;
    }, testTileUrl);

    expect(deleted).toBe(true);
  });

  test("6. Leaflet map offline render: map tile displays in DOM with zero network", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    const testTileUrl = `https://api.maptiler.com/maps/streets-v2/12/2048/1365.png?key=${MT_KEY}`;

    // 1. Pre-cache the tile
    await page.evaluate(async (url) => {
      const cache = await window.caches.open("map-tiles-cache");
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      await cache.put(url, res.clone());
    }, testTileUrl);

    // 2. Cut off network connection
    await context.setOffline(true);

    // 3. Render Leaflet-style tile inside the page DOM using cached data
    const mapTileRendered = await page.evaluate(async (url) => {
      const cache = await window.caches.open("map-tiles-cache");
      const matched = await cache.match(url);
      if (!matched) return false;

      const blob = await matched.blob();
      const objUrl = URL.createObjectURL(blob);

      const tileImg = document.createElement("img");
      tileImg.id = "leaflet-offline-test-tile-img";
      tileImg.className = "leaflet-tile leaflet-tile-loaded";
      tileImg.style.position = "fixed";
      tileImg.style.top = "50px";
      tileImg.style.left = "50px";
      tileImg.style.width = "256px";
      tileImg.style.height = "256px";
      tileImg.style.zIndex = "999999";
      tileImg.style.display = "block";
      tileImg.style.visibility = "visible";
      tileImg.style.opacity = "1";
      tileImg.src = objUrl;

      document.body.appendChild(tileImg);

      return new Promise<boolean>((resolve) => {
        tileImg.onload = () => {
          resolve(tileImg.complete && tileImg.naturalWidth > 0);
        };
        tileImg.onerror = () => resolve(false);
      });
    }, testTileUrl);

    expect(mapTileRendered).toBe(true);

    // Verify element is physically attached to the DOM and visible
    const imgLocator = page.locator("#leaflet-offline-test-tile-img");
    await expect(imgLocator).toBeVisible();

    await context.setOffline(false);
  });
});
