// Real offline map tile caching via the Cache Storage API. Must use the same
// cache name as the "map-tiles-cache" runtimeCaching rule in sw.ts
// so tiles fetched here are served by the CacheFirst strategy when offline,
// and tiles the service worker opportunistically caches while browsing are
// visible here too.
export const TILE_CACHE_NAME = "map-tiles-cache";

// Rough average size of a CARTO PNG raster tile used as fallback when the
// content-length header is absent.
const ESTIMATED_TILE_BYTES = 15_000;

function lonLatToTile(lon: number, lat: number, z: number) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}

// CARTO's free basemap tiles — no API key (two whole live-reported bugs came
// from MapTiler key handling: an invalid key on 2026-09-11, then still
// "Invalid key" again on 2026-09-20 after a supposedly-corrected key), and
// unlike raw tile.openstreetmap.org (also tried, also live-403'd — it
// rate-limits/blocks non-browser and high-volume production traffic by
// design), CARTO explicitly permits this kind of hotlinked production use.
// Real light AND dark styles, so no CSS invert-filter hack needed either.
// A single hardcoded subdomain ("a") rather than Leaflet's usual {s}
// round-robin: this function returns a concrete URL for direct fetch/cache
// (offline download + Cache Storage), not a Leaflet template string.
function tileUrl(darkMode: boolean, z: number, x: number, y: number): string {
  const style = darkMode ? "dark_all" : "light_all";
  return `https://a.basemaps.cartocdn.com/${style}/${z}/${x}/${y}.png`;
}

/** Tile x/y range covering a square region centered on (lat, lng) at one zoom. */
export function tileRange(lat: number, lng: number, radiusDeg: number, z: number) {
  const tl = lonLatToTile(lng - radiusDeg, lat + radiusDeg, z);
  const br = lonLatToTile(lng + radiusDeg, lat - radiusDeg, z);
  return { minX: tl.x, maxX: br.x, minY: tl.y, maxY: br.y };
}

export function getTileUrl(darkMode: boolean, z: number, x: number, y: number): string {
  return tileUrl(darkMode, z, x, y);
}

/** Tile URLs covering a square region centered on (lat, lng), across zoomMin..zoomMax. */
export function computeTileUrls(
  lat: number,
  lng: number,
  radiusDeg: number,
  zoomMin: number,
  zoomMax: number,
  darkMode: boolean,
): string[] {
  const urls: string[] = [];
  for (let z = zoomMin; z <= zoomMax; z++) {
    const tl = lonLatToTile(lng - radiusDeg, lat + radiusDeg, z);
    const br = lonLatToTile(lng + radiusDeg, lat - radiusDeg, z);
    for (let x = tl.x; x <= br.x; x++) {
      for (let y = tl.y; y <= br.y; y++) {
        urls.push(tileUrl(darkMode, z, x, y));
      }
    }
  }
  return urls;
}

export async function downloadTiles(
  urls: string[],
  onProgress: (done: number, total: number, bytes: number) => void,
): Promise<number> {
  if (!("caches" in window)) throw new Error("Cache Storage API unavailable in this browser");

  const cache = await caches.open(TILE_CACHE_NAME);
  let done = 0;
  let bytes = 0;
  let idx = 0;
  const CONCURRENCY = 6;

  async function worker() {
    while (idx < urls.length) {
      const url = urls[idx++];
      try {
        const existing = await cache.match(url);
        if (existing) {
          const len = existing.headers.get("content-length");
          bytes += len ? parseInt(len, 10) : ESTIMATED_TILE_BYTES;
        } else {
          let res: Response;
          try {
            res = await fetch(url, { mode: "cors" });
          } catch {
            res = await fetch(url, { mode: "no-cors" });
          }
          if (res.status === 200 || res.type === "opaque") {
            await cache.put(url, res.clone());
            const len = res.headers.get("content-length");
            bytes += len ? parseInt(len, 10) : ESTIMATED_TILE_BYTES;
          }
        }
      } catch {
        // Skip tiles that fail (rate limit, offline mid-download, etc) —
        // partial regions are still usable, just with gaps.
      }
      done++;
      onProgress(done, urls.length, bytes);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));
  return bytes;
}

export async function deleteTiles(urls: string[]): Promise<void> {
  if (!("caches" in window)) return;
  const cache = await caches.open(TILE_CACHE_NAME);
  await Promise.all(urls.map((u) => cache.delete(u)));
}

const TILE_PX = 256;

// A tile cached via the Cache Storage API only ever lives inside the
// browser's own storage — invisible to the OS file manager, not shareable,
// gone if the user clears site data. This stitches one zoom level of an
// already-downloaded region into a single flat PNG (one <canvas>, one
// image) that the browser's normal download flow saves to the device's
// Downloads folder — a real, single file the user can open directly with
// no unzipping or browsing a tiles/{z}/{x}/{y} tree to find anything.
// First version zipped the raw tile files instead (see git history) —
// live feedback was that a folder-of-many-small-files, even as a single
// .zip, wasn't what "download the map" meant to a real user; one picture
// of the region is. Reads tiles from the cache first (already on disk
// from the "Download for offline" step); falls back to a fresh fetch for
// any tile that's missing, but only when online (a region always has some
// gaps, and this export is exactly the flow most people run offline —
// waiting out a real network attempt per gap is what made the earlier
// zip version look stuck).
export async function exportRegionToImage(
  region: { lat: number; lng: number },
  radiusDeg: number,
  zoom: number,
  darkMode: boolean,
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  const { minX, maxX, minY, maxY } = tileRange(region.lat, region.lng, radiusDeg, zoom);
  const cols = maxX - minX + 1;
  const rows = maxY - minY + 1;

  const canvas = document.createElement("canvas");
  canvas.width = cols * TILE_PX;
  canvas.height = rows * TILE_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas rendering is unavailable in this browser");

  const cache = "caches" in window ? await caches.open(TILE_CACHE_NAME) : null;
  const total = cols * rows;
  let done = 0;

  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      const url = tileUrl(darkMode, zoom, x, y);
      try {
        let response = cache ? await cache.match(url) : undefined;
        if (!response && navigator.onLine) response = await fetch(url, { mode: "cors" });
        if (response && (response.ok || response.type === "opaque")) {
          const blob = await response.blob();
          const bitmap = await createImageBitmap(blob);
          ctx.drawImage(bitmap, (x - minX) * TILE_PX, (y - minY) * TILE_PX, TILE_PX, TILE_PX);
          bitmap.close();
        }
      } catch {
        // Leave that cell blank — a partial image is still a usable map,
        // same graceful-degradation the zoomed tile grid already has.
      }
      done++;
      onProgress?.(done, total);
    }
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Failed to render image"))),
      "image/png",
    );
  });
}

// Triggers the browser's normal save-file flow — lands in the device's
// Downloads folder (or wherever the browser/OS routes downloads), exactly
// like downloading any other file from the web.
export function saveBlobToDevice(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on a delay, not immediately — some browsers read the blob URL
  // asynchronously after the click before actually starting the download.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${mb.toFixed(1)} MB`;
}
