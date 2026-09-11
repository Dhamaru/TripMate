import { useEffect, useRef, useState } from "react";

export interface LiveCoords {
  lat: number;
  lon: number;
}

/**
 * Continuous GPS position via watchPosition, active only while `enabled` is
 * true. Unlike useUserLocation (one-shot, cached, shared app-wide), this is
 * per-consumer and starts a real permission-gated watch — only mount it on
 * pages where live tracking is the point (Trip Map, Emergency Services), and
 * pass enabled=false (or unmount) everywhere else so it isn't draining
 * battery in the background.
 */
export function useLiveLocation(enabled: boolean): {
  coords: LiveCoords | null;
  error: string | null;
} {
  const [coords, setCoords] = useState<LiveCoords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!navigator.geolocation) {
      setError("Geolocation not supported in this browser.");
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setError(null);
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED ? "Location access denied." : "Location unavailable.",
        );
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );

    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    };
  }, [enabled]);

  return { coords, error };
}
