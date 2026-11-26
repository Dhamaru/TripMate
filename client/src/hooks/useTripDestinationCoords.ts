import { useEffect, useState } from "react";
import type { Coords } from "./useUserLocation";

// Trips don't store destination coordinates (shared/schema.ts has no
// lat/lon field on Trip) — every consumer that needs them geocodes the
// destination string on demand (TripMap.tsx already does this). Cache by
// destination string so switching between search bars on the same trip
// page doesn't re-geocode the same city repeatedly.
const cache = new Map<string, Coords | null>();

/**
 * Resolves a trip's destination city to coordinates, for biasing place
 * search toward where the trip actually is rather than the device's
 * current physical location — the point of searching "restaurants in
 * Tokyo" while sitting at home.
 */
export function useTripDestinationCoords(
  destination: string | undefined,
): Coords | null | undefined {
  const [coords, setCoords] = useState<Coords | null | undefined>(
    destination ? cache.get(destination) : null,
  );

  useEffect(() => {
    if (!destination) {
      setCoords(null);
      return;
    }
    if (cache.has(destination)) {
      setCoords(cache.get(destination));
      return;
    }
    let cancelled = false;
    setCoords(undefined);
    fetch(`/api/v1/geocode?q=${encodeURIComponent(destination)}`)
      .then((r) => r.json())
      .then((data) => {
        const first = Array.isArray(data) ? data[0] : null;
        const result: Coords | null =
          first && first.lat && first.lon
            ? { lat: Number(first.lat), lon: Number(first.lon) }
            : null;
        cache.set(destination, result);
        if (!cancelled) setCoords(result);
      })
      .catch(() => {
        cache.set(destination, null);
        if (!cancelled) setCoords(null);
      });
    return () => {
      cancelled = true;
    };
  }, [destination]);

  return coords;
}
