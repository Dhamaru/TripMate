// Wikimedia's thumbnail CDN now serves only a fixed set of widths and
// answers HTTP 400 for any other "NNNpx-" size (live-verified 2026-10-15:
// 330/500/960/1280/1920 → 200; 320/400/640/800/1200 → 400). Trips saved
// earlier stored 800px/1200px thumbs, so their cover images broke.
const STANDARD_WIDTHS = [120, 250, 330, 500, 960, 1280, 1920];

/**
 * Snap a Wikimedia thumbnail URL down to the nearest width the CDN still
 * serves. Down, not up: asking for more pixels than the original has is
 * also an error. Any other URL is returned unchanged.
 */
export function snapWikimediaThumb(url: string): string {
  if (!/^https:\/\/[a-z.]*wikimedia\.org\/.*\/thumb\//.test(url)) return url;
  return url.replace(/\/(\d+)px-([^/]+)$/, (whole, w: string, file: string) => {
    const width = Number(w);
    if (STANDARD_WIDTHS.includes(width)) return whole;
    const snapped = [...STANDARD_WIDTHS].reverse().find((s) => s <= width) ?? STANDARD_WIDTHS[0];
    return `/${snapped}px-${file}`;
  });
}
