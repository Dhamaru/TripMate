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

// MapTiler raster tiles — light (streets-v2) or dark (streets-v2-dark).
// The key is injected at build time from VITE_MAPTILER_KEY (vite.config.ts's
// envDir points at the repo root .env, not client/.env, so this actually
// gets picked up). No hardcoded fallback key — a demo key baked into
// shipped source is exactly the API-key-leak pattern this codebase has
// already been burned by (see CONTEXT.md's GOOGLE_API_KEY history); if the
// real key is missing, every caller here should visibly fail instead of
// silently working against someone else's shared quota.
export const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY as string | undefined;
function tileUrl(darkMode: boolean, z: number, x: number, y: number): string {
  const style = darkMode ? "streets-v2-dark" : "streets-v2";
  return `https://api.maptiler.com/maps/${style}/${z}/${x}/${y}.png?key=${MAPTILER_KEY || ""}`;
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

// A tile cached via the Cache Storage API only ever lives inside the
// browser's own storage — invisible to the OS file manager, not shareable,
// gone if the user clears site data. This packages an already-downloaded
// region into one real .zip file (tiles/{z}/{x}/{y}.png + a manifest) that
// the browser's normal download flow saves to the device's Downloads
// folder, same as any other file download — the user can move, share, or
// back it up like any other file. Reads from the cache first (already on
// disk from the "Download for offline" step); falls back to a fresh fetch
// for any tile that's missing so a partial region can still be exported.
export async function exportRegionToZip(
  region: { id: string; name: string; country: string; lat: number; lng: number; zoom: number },
  tileUrls: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const tileUrlRe = /\/maps\/([^/]+)\/(\d+)\/(\d+)\/(\d+)\.png/;

  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        app: "TripMate",
        exportedAt: new Date().toISOString(),
        region: {
          name: region.name,
          country: region.country,
          lat: region.lat,
          lng: region.lng,
          zoom: region.zoom,
        },
        tileCount: tileUrls.length,
      },
      null,
      2,
    ),
  );

  const cache = "caches" in window ? await caches.open(TILE_CACHE_NAME) : null;
  let done = 0;
  for (const url of tileUrls) {
    const match = tileUrlRe.exec(url);
    try {
      let response = cache ? await cache.match(url) : undefined;
      if (!response) response = await fetch(url, { mode: "cors" });
      if (response.ok || response.type === "opaque") {
        const blob = await response.blob();
        const path = match
          ? `tiles/${match[1]}/${match[2]}/${match[3]}/${match[4]}.png`
          : `tiles/${done}.png`;
        zip.file(path, blob);
      }
    } catch {
      // Skip tiles that can't be read/fetched — a partial export is still
      // a usable archive of everything that did come through.
    }
    done++;
    onProgress?.(done, tileUrls.length);
  }

  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
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
