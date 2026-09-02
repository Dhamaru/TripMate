import { useEffect, useRef, useState } from "react";
import type { Coords } from "./useUserLocation";

export interface PlaceSuggestion {
  id: string;
  name: string;
  address?: string;
  display_name: string;
  location?: { lat: number; lng: number };
}

/**
 * Debounced place-search-as-you-type, biased toward `biasCoords` when
 * given (the user's real location, or a trip's destination — see
 * useUserLocation and useTripDestinationCoords). Every search bar in the
 * app that picks a real-world place shares this one implementation
 * instead of five slightly-different copies of the same fetch+debounce.
 */
export function usePlaceSuggestions(query: string, biasCoords: Coords | null | undefined) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const requestId = ++requestIdRef.current;
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ query: trimmed, pageSize: "6" });
        if (biasCoords) {
          params.set("lat", String(biasCoords.lat));
          params.set("lon", String(biasCoords.lon));
        }
        const res = await fetch(`/api/v1/places/search?${params.toString()}`);
        const data = await res.json().catch(() => ({ items: [] }));
        // A slower earlier request resolving after a newer one would
        // otherwise flash stale suggestions over fresh ones.
        if (requestId === requestIdRef.current) {
          setSuggestions(Array.isArray(data.items) ? data.items : []);
        }
      } catch {
        if (requestId === requestIdRef.current) setSuggestions([]);
      } finally {
        if (requestId === requestIdRef.current) setIsLoading(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // biasCoords is a plain object recreated on some renders — compare by
    // value, not reference, so this doesn't re-debounce on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, biasCoords?.lat, biasCoords?.lon]);

  return { suggestions, isLoading };
}
