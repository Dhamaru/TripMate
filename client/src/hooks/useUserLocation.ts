import { useEffect, useState } from "react";

export interface Coords {
  lat: number;
  lon: number;
}

// Module-level cache — every search bar in the app wants "the user's
// current location" independently; without this each one would fire its
// own getCurrentPosition() call (a real, separately-prompted browser
// permission request per component), and a user with several search bars
// on one page would get asked, or silently re-geolocated, over and over.
// One request per page load, shared by every consumer.
let cachedLocation: Coords | null | undefined; // undefined = not yet resolved
let inFlight: Promise<Coords | null> | null = null;

function resolveLocation(): Promise<Coords | null> {
  if (cachedLocation !== undefined) return Promise.resolve(cachedLocation);
  if (inFlight) return inFlight;

  inFlight = new Promise<Coords | null>((resolve) => {
    if (!navigator.geolocation) {
      cachedLocation = null;
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        cachedLocation = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        resolve(cachedLocation);
      },
      () => {
        // Denied, unavailable, or timed out — every search bar's fallback
        // is just unsorted text-match results, so null is a fine, quiet
        // outcome here rather than something callers need to handle as an
        // error.
        cachedLocation = null;
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 10 * 60 * 1000 },
    );
  }).finally(() => {
    inFlight = null;
  });

  return inFlight;
}

/**
 * The user's current coordinates, resolved once per page load and shared
 * across every consumer. Returns `undefined` while resolving, `null` if
 * geolocation is unavailable/denied/timed out, or real coordinates.
 * Never throws and never prompts more than once.
 */
export function useUserLocation(): Coords | null | undefined {
  const [coords, setCoords] = useState<Coords | null | undefined>(cachedLocation);

  useEffect(() => {
    if (cachedLocation !== undefined) return;
    let cancelled = false;
    resolveLocation().then((result) => {
      if (!cancelled) setCoords(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return coords;
}
