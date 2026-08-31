// Real offline map tile caching via the Cache Storage API. Must use the same
// cache name as the "map-tiles-cache" runtimeCaching rule in vite.config.ts
// so tiles fetched here are served by the CacheFirst strategy when offline,
// and tiles the service worker opportunistically caches while browsing are
// visible here too.
export const TILE_CACHE_NAME = "map-tiles-cache";

// Rough average size of an OSM PNG raster tile. Cross-origin tile requests
// come back as opaque responses when CORS fails, which have no readable
// content-length — this is the fallback used for those.
const ESTIMATED_TILE_BYTES = 15_000;

function lonLatToTile(lon: number, lat: number, z: number) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}

// OSM only serves one (light) style — dark mode is a CSS filter applied to
// the tile pane at render time (see OfflineMaps.tsx), not a different tile
// set, so darkMode has no effect on which tile gets cached here. Kept as a
// parameter so cached dark/light "regions" still address the same tiles.
function tileUrl(_darkMode: boolean, z: number, x: number, y: number): string {
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
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

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${mb.toFixed(1)} MB`;
}
