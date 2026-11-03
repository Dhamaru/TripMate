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
export function usePlaceSuggestions(
  query: string,
  biasCoords: Coords | null | undefined,
  // "city" restricts results to Google's locality type — for an origin/
  // destination field, not for a specific-business picker (a restaurant,
  // an activity, an attraction), which should keep seeing everything.
  // "area" = neighbourhoods/streets/PIN codes for a "where are you" box.
  placeType?: "city" | "area",
) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  // Google bills autocomplete keystrokes that share a session token as one
  // session (and the follow-up /location lookup with it). A session ends
  // when the box is cleared, when a place is picked, or after ~3 minutes.
  const sessionRef = useRef<{ token: string; at: number } | null>(null);
  const sessionToken = () => {
    if (!sessionRef.current || Date.now() - sessionRef.current.at > 170_000) {
      const token =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionRef.current = { token, at: Date.now() };
    }
    return sessionRef.current.token;
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (trimmed.length < 3) {
      sessionRef.current = null;
      setSuggestions([]);
      setIsLoading(false);
      return;
    }
    // Loading from the first keystroke, not only once the debounce fires:
    // the previous query's suggestions are still on screen meanwhile, and
    // Enter must not pick one of those for text the user has since changed.
    setIsLoading(true);

    debounceRef.current = setTimeout(async () => {
      const requestId = ++requestIdRef.current;
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ query: trimmed, pageSize: "6" });
        if (biasCoords) {
          params.set("lat", String(biasCoords.lat));
          params.set("lon", String(biasCoords.lon));
        }
        if (placeType) {
          params.set("type", placeType);
          params.set("sessiontoken", sessionToken());
        }
        const res = await fetch(`/api/v1/places/search?${params.toString()}`);
        // A rate-limited/failed response otherwise fell through to the
        // `.catch` fallback below and degraded silently to "no suggestions"
        // with nothing observable in client logs.
        if (!res.ok) throw new Error(`places/search ${res.status}`);
        const data = await res.json().catch(() => ({ items: [] }));
        // A slower earlier request resolving after a newer one would
        // otherwise flash stale suggestions over fresh ones.
        if (requestId === requestIdRef.current) {
          setSuggestions(Array.isArray(data.items) ? data.items : []);
        }
      } catch (err) {
        console.warn("[usePlaceSuggestions] search failed:", err);
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
  }, [query, biasCoords?.lat, biasCoords?.lon, placeType]);

  /** Token for the /places/location lookup of a picked suggestion; ends the session. */
  const takeSessionToken = () => {
    const token = sessionRef.current?.token;
    sessionRef.current = null;
    return token;
  };

  return { suggestions, isLoading, takeSessionToken };
}
