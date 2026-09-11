/** Great-circle distance in meters between two lat/lon points. */
export function haversineMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/**
 * Nearest-vertex approximation of a point's distance to a polyline, in
 * meters. Good enough for off-route detection: OSRM's full geometry is dense
 * (a vertex every few meters on real roads), so the true point-to-segment
 * distance is never far off the nearest-vertex distance — not worth the
 * extra segment-projection math for a threshold check.
 */
export function distanceToPolylineMeters(
  point: { lat: number; lon: number },
  polyline: Array<[number, number]>,
): number {
  let min = Infinity;
  for (const [lat, lon] of polyline) {
    const d = haversineMeters(point, { lat, lon });
    if (d < min) min = d;
  }
  return min;
}
