import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { safeParsePlan, isValidPlanLike } from "@/lib/planParser";
import { TripMateLogo } from "@/components/TripMateLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { logError, logInfo } from "@/lib/logger";
import { Link, useLocation } from "wouter";
import { useAuthStore, useTripStore } from "@/store";
import type { Trip } from "@/types/api.types";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { usePlaceSuggestions, type PlaceSuggestion } from "@/hooks/usePlaceSuggestions";
import { useUserLocation } from "@/hooks/useUserLocation";
import { PlaceSearchDropdown } from "@/components/PlaceSearchDropdown";
import { ImportPlanPreview } from "@/components/ImportPlanPreview";

import { Mountain, Armchair, Landmark, Utensils } from "lucide-react";

const travelStyles = [
  {
    id: "adventure",
    name: "Adventure",
    caption: "Trails & thrills",
    Icon: Mountain,
    tint: "icon-tint-amber",
    ink: "#163F73",
  },
  {
    id: "relaxed",
    name: "Relaxed",
    caption: "Slow & easy",
    Icon: Armchair,
    tint: "icon-tint-blue",
    ink: "#1D4E89",
  },
  {
    id: "cultural",
    name: "Cultural",
    caption: "Sights & stories",
    Icon: Landmark,
    tint: "icon-tint-purple",
    ink: "#7C5FD6",
  },
  {
    id: "culinary",
    name: "Culinary",
    caption: "Bites & flavors",
    Icon: Utensils,
    tint: "icon-tint-green",
    ink: "#2F6F4E",
  },
];

// Guess a sensible default currency from the browser's locale rather than
// hardcoding INR for every user regardless of where they actually are.
function guessDefaultCurrency(): string {
  try {
    const region = navigator.language.split("-")[1]?.toUpperCase();
    const regionCurrency: Record<string, string> = {
      IN: "INR",
      US: "USD",
      GB: "GBP",
      AU: "AUD",
      CA: "CAD",
      JP: "JPY",
      CN: "CNY",
      DE: "EUR",
      FR: "EUR",
      ES: "EUR",
      IT: "EUR",
    };
    return (region && regionCurrency[region]) || "USD";
  } catch {
    return "USD";
  }
}

const CURRENCY_FORMAT: Record<string, { symbol: string; locale: string }> = {
  INR: { symbol: "₹", locale: "en-IN" },
  USD: { symbol: "$", locale: "en-US" },
  EUR: { symbol: "€", locale: "de-DE" },
  GBP: { symbol: "£", locale: "en-GB" },
  AUD: { symbol: "A$", locale: "en-AU" },
  CAD: { symbol: "C$", locale: "en-CA" },
  JPY: { symbol: "¥", locale: "ja-JP" },
  CNY: { symbol: "¥", locale: "zh-CN" },
};

function formatMoney(amount: number, currency: string | undefined) {
  const fmt = CURRENCY_FORMAT[currency || "INR"] || CURRENCY_FORMAT.INR;
  return `${fmt.symbol}${Number(amount || 0).toLocaleString(fmt.locale)}`;
}

export default function TripPlanner() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading, isAuthenticated } = useAuthStore();
  const { createTrip } = useTripStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [tripForm, setTripForm] = useState({
    origin: "",
    destination: "",
    budget: "",
    currency: guessDefaultCurrency(),
    days: "",
    groupSize: "",
    travelStyle: "",
    transportMode: "",
    isInternational: false,
    notes: "",
    cuisinePreferences: [] as string[],
    dietaryPreferences: [] as string[],
  });

  // Prefill from the profile's saved preferences (client/src/pages/Profile.tsx)
  // the first time they become available — a per-trip edit here doesn't
  // change the profile default, it's just this trip's starting point.
  const prefilledPrefsRef = useRef(false);
  useEffect(() => {
    if (prefilledPrefsRef.current) return;
    const savedCuisine = (user as any)?.cuisinePreferences;
    const savedDiet = (user as any)?.dietaryPreferences;
    if (savedCuisine?.length || savedDiet?.length) {
      prefilledPrefsRef.current = true;
      setTripForm((prev) => ({
        ...prev,
        cuisinePreferences: savedCuisine || [],
        dietaryPreferences: savedDiet || [],
      }));
    }
  }, [user]);

  // Origin biases toward where the user actually is ("traveling from" —
  // their real location is the natural default). Destination is a plain
  // text-match place search with no bias, same as the Landing.tsx hero
  // search — "where do you want to go" has no sensible "near me" ranking.
  const userLocation = useUserLocation();
  const [showOriginSuggestions, setShowOriginSuggestions] = useState(false);
  const [showDestSuggestions, setShowDestSuggestions] = useState(false);
  const { suggestions: originSuggestions, isLoading: originLoading } = usePlaceSuggestions(
    showOriginSuggestions ? tripForm.origin : "",
    userLocation,
    "city",
  );
  const { suggestions: destSuggestions, isLoading: destLoading } = usePlaceSuggestions(
    showDestSuggestions ? tripForm.destination : "",
    undefined,
    "city",
  );

  const [selectedStyle, setSelectedStyle] = useState("");
  const [selectedPackingItems, setSelectedPackingItems] = useState<string[]>([]);
  const hasSaved = useRef(false);
  // Which required field(s) failed on the last submit attempt — the
  // "Missing Information" toast dismisses after a few seconds with no
  // lasting indicator of which field to fix; a real-user QA pass flagged
  // this as silent friction (e.g. leaving Group Size unset). Persists a
  // visible error state until the field is actually filled in.
  const [submitErrors, setSubmitErrors] = useState<Set<string>>(new Set());

  // "Import My Plan" mode
  const [planMode, setPlanMode] = useState<"ai" | "import">("ai");
  const [importForm, setImportForm] = useState({
    scheduleText: "",
    startDate: "",
    groupSize: "",
    budget: "",
    currency: guessDefaultCurrency(),
  });
  const [isParsing, setIsParsing] = useState(false);
  const importSaved = useRef(false);
  // Persistent inline errors for the Import form — the toast the old
  // validation showed for a couple of these cases disappears after a few
  // seconds with no lasting indicator of which field to fix, same gap the
  // AI-plan form's submitErrors above was already built to close.
  const [importErrors, setImportErrors] = useState<Record<string, string>>({});
  // The parsed plan, shown via ImportPlanPreview for review before it
  // becomes a real trip. null = still on the paste-your-schedule form.
  const [importPreview, setImportPreview] = useState<any>(null);

  // Prefill from ?destination=&style= query params (e.g. landing page hero search)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const destination = params.get("destination");
    const style = params.get("style");
    if (destination) setTripForm((prev) => ({ ...prev, destination }));
    if (style && travelStyles.some((s) => s.id === style)) setSelectedStyle(style);
  }, []);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        setLocation("/signin");
      }, 500);
      return;
    }
  }, [isAuthenticated, authLoading, toast]);

  const createTripMutation = useMutation({
    mutationFn: async (tripData: any) => {
      return await createTrip(tripData);
    },
    onSuccess: async (trip: any) => {
      // Plain prefix matching only invalidates an exact-element match, so
      // ['/api/v1/trips'] does NOT catch queries keyed on the full URL
      // string '/api/v1/trips?light=true' (a single element, not a nested
      // array) — every page using the light variant (e.g. the packing list's
      // trip picker) kept serving a stale trip list until a hard reload.
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/api/v1/trips"),
      });

      toast({
        title: "Trip Created!",
        description: "Your trip has been successfully planned.",
      });

      const targetId = trip.id;
      if (targetId) {
        setLocation(`/app/trips/${targetId}`);
      }
    },
    onError: (error: any) => {
      console.error("Trip creation error:", error);
      const errorMessage = error?.message || "Failed to create trip. Please try again.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleImportSchedule = async (e: React.FormEvent) => {
    e.preventDefault();

    // Mirrors parseScheduleSchema (server/schemas/trip.schemas.ts) so a
    // request that would just get rejected by the server never leaves
    // the browser — same checks, immediate feedback, no round trip.
    const errors: Record<string, string> = {};
    const trimmedSchedule = importForm.scheduleText.trim();
    if (trimmedSchedule.length < 20) {
      errors.scheduleText = "Tell us a bit more about your trip — at least 20 characters.";
    } else if (!/[A-Z][a-zA-Z]{2,}/.test(trimmedSchedule)) {
      errors.scheduleText =
        "We couldn't find a place name in your schedule — try including city or location names.";
    }
    if (!importForm.groupSize) {
      errors.groupSize = "Please select a group size.";
    }
    if (importForm.startDate) {
      const chosen = new Date(importForm.startDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (chosen < today) {
        errors.startDate = "Start date can't be in the past.";
      }
    }
    if (Object.keys(errors).length > 0) {
      setImportErrors(errors);
      return;
    }
    setImportErrors({});

    setIsParsing(true);
    importSaved.current = false;
    try {
      const res = await apiRequest("POST", "/api/v1/trips/parse-schedule", {
        scheduleText: importForm.scheduleText,
        startDate: importForm.startDate || undefined,
        groupSize: parseInt(importForm.groupSize) || 1,
        budget: importForm.budget ? parseFloat(importForm.budget) : undefined,
        currency: importForm.currency || "INR",
      });
      const parsed = await res.json().catch(() => null);

      if (!res.ok) {
        // Server-side validation/rate-limit rejection — surface the real
        // reason (errorHandler.middleware.ts's shape: { error: string })
        // instead of the generic "check the format" message, which was
        // shown for every failure regardless of cause.
        toast({
          title: res.status === 429 ? "Slow down" : "Couldn't parse that",
          description: parsed?.error || "Please check your schedule and try again.",
          variant: "destructive",
        });
        return;
      }
      if (!parsed || !parsed.itinerary) {
        toast({
          title: "Parse Failed",
          description: "Could not parse your schedule. Please check the format.",
          variant: "destructive",
        });
        return;
      }

      // Review before creating — matches the "Let AI Plan" mode's own
      // Save-Trip-after-review pattern (line ~1560) rather than
      // auto-creating the trip the instant the parse succeeds, with no
      // chance to see what the AI actually understood from the pasted
      // text before it becomes a real trip.
      setImportPreview(parsed);
    } catch (err: any) {
      console.error("[ImportSchedule] Error:", err);
      toast({
        title: "Error",
        description: "Failed to parse schedule. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsParsing(false);
    }
  };

  // Builds the actual createTrip payload from a parsed plan — split out
  // from handleImportSchedule since it now runs at confirm-time (after
  // the preview), not immediately on parse success.
  const buildImportTripData = (parsed: any) => ({
    origin:
      importForm.scheduleText
        .match(/from\s+([A-Za-z ]+)/i)?.[1]
        ?.split(" to ")[0]
        ?.trim() || "",
    destination: parsed.destination || "Multi-city Trip",
    budget: importForm.budget ? parseFloat(importForm.budget) : undefined,
    days: parsed.days || parsed.itinerary.length,
    groupSize: parseInt(importForm.groupSize) || 1,
    travelStyle: "standard" as const,
    currency: importForm.currency || "INR",
    status: "planning" as const,
    startDate: parsed.startDate
      ? new Date(parsed.startDate)
      : importForm.startDate
        ? new Date(importForm.startDate)
        : undefined,
    notes: parsed.notes || "",
    // Spread ...day first so the enrichment pass's day-level fields
    // (theme, location, wakeUpTime, headlineExperience,
    // departureReminder, dayBudget, weatherNote) survive — the explicit
    // fields after override only what needs a real transform
    // (dayIndex/day/date), not a full field rename.
    itinerary: parsed.itinerary.map((day: any, idx: number) => ({
      ...day,
      dayIndex: idx,
      day: day.day || idx + 1,
      date: day.date ? new Date(day.date) : undefined,
      activities: (day.activities || []).map((act: any) => ({
        ...act,
        title: act.title || "Activity",
        address: act.address || act.to || act.from || "",
      })),
    })),
  });

  const handleConfirmImportTrip = () => {
    if (!importPreview) return;
    createTripMutation.mutate(buildImportTripData(importPreview));
  };

  const handleCancelImportPreview = () => {
    setImportPreview(null);
    importSaved.current = false;
  };

  const planTripMutation = useMutation({
    mutationFn: async () => {
      const origin = tripForm.origin.trim();
      const dest = tripForm.destination.trim();
      const days = parseInt(tripForm.days) || 1;
      const persons = parseInt(tripForm.groupSize) || 1;
      const budget = tripForm.budget ? parseFloat(tripForm.budget) : undefined;
      const currency = tripForm.currency || "INR";
      const typeOfTrip = selectedStyle || "relaxed";
      const travelMedium = tripForm.transportMode || "road";
      const preferences = tripForm.notes || "";
      const payload = {
        origin,
        destination: dest,
        days,
        persons,
        budget,
        currency,
        typeOfTrip,
        travelMedium,
        preferences,
        cuisinePreferences: tripForm.cuisinePreferences,
        dietaryPreferences: tripForm.dietaryPreferences,
      } as any;

      const trySafeParse = (obj: any) => safeParsePlan(obj);

      try {
        const res = await apiRequest("POST", "/api/v1/trips/generate-itinerary", payload);
        if (res.ok) {
          const json = await res.json().catch(() => null);
          const parsed = trySafeParse(json);
          if (parsed && isValidPlanLike(parsed)) return parsed;
          throw new Error("parse_failed");
        }
      } catch (err) {
        // Falls through to the /api/tools/planTrip retry below, then to the
        // client-side itinerary builder — this was a bare empty catch, so a
        // real production failure here (network error, bad JSON, a plan
        // shape mismatch) left zero trace to debug from.
        logInfo("[TripPlanner] Primary itinerary generation failed, trying fallback", {
          error: String(err),
        });
      }

      try {
        const res2 = await apiRequest("POST", "/api/tools/planTrip", payload);
        if (res2.ok) {
          let data2: any = null;
          try {
            data2 = await res2.json();
          } catch {}
          const parsed3 = trySafeParse(data2);
          if (parsed3 && isValidPlanLike(parsed3)) return parsed3;
        }
      } catch (err) {
        logError(
          "[TripPlanner] Fallback itinerary generation also failed, using client-side builder",
          { error: String(err) },
        );
      }
      const speedKmH = travelMedium === "walk" ? 4 : travelMedium === "transit" ? 20 : 30;
      const pace =
        typeOfTrip === "relaxed" ? "relaxed" : typeOfTrip === "adventure" ? "fast" : "normal";
      const startHour = pace === "relaxed" ? 9 : pace === "fast" ? 8 : 8.5;
      const lunchHour = 13;
      const dinnerHour = 19;
      const activityDuration = pace === "relaxed" ? 75 : pace === "fast" ? 60 : 90;
      const bufferMin = 15;
      const toKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371;
        const dLat = ((lat2 - lat1) * Math.PI) / 180;
        const dLon = ((lon2 - lon1) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
      };
      const travelTime = (km: number) =>
        Math.min(180, Math.max(10, Math.round((km / speedKmH) * 60)));
      const pad = (n: number) => String(Math.floor(n)).padStart(2, "0");
      const fmt = (h: number, m: number) => `${pad(h)}:${pad(m)}`;
      const addMinutes = (h: number, m: number, add: number) => {
        const t = h * 60 + m + add;
        const nh = Math.floor(t / 60);
        const nm = t % 60;
        return { h: nh, m: nm };
      };
      let center = { lat: 0, lon: 0, display: dest };
      try {
        const geoRes = await apiRequest("GET", `/api/v1/geocode?q=${encodeURIComponent(dest)}`);
        const data = await geoRes.json().catch(() => []);
        const gj = Array.isArray(data) ? data[0] : null;
        if (gj && Number.isFinite(gj.lat) && Number.isFinite(gj.lon)) {
          center = {
            lat: Number(gj.lat),
            lon: Number(gj.lon),
            display: String(gj.displayName || dest),
          };
        } else {
          // center stays (0,0) — planTrip AI fallback will still run
        }
      } catch {}
      const fetchItems = async (q: string) => {
        try {
          const r = await apiRequest(
            "GET",
            `/api/v1/places/search?query=${encodeURIComponent(q)}&pageSize=50`,
          );
          const j = await r.json().catch(() => ({}));
          const arr = Array.isArray(j) ? j : Array.isArray(j?.items) ? j.items : [];
          return arr
            .map((i: any) => {
              const rawAddr = [i.road, i.city, i.country, i.postcode].filter(Boolean).join(", ");
              const lat = Number(i.lat ?? i.location?.lat ?? i.geometry?.location?.lat);
              const lon = Number(
                i.lon ?? i.location?.lng ?? i.location?.lon ?? i.geometry?.location?.lng,
              );
              return {
                id: String(i.id || i.osm_id || Math.random()),
                name: String(i.name || i.name_en || i.name_local || i.display_name || ""),
                address:
                  i.address ||
                  rawAddr ||
                  String(i.display_name || i.formatted_address || "")
                    .split(",")
                    .slice(0, 3)
                    .join(", "),
                lat,
                lon,
                display: String(i.display_name || i.formatted_address || ""),
              };
            })
            .filter((x: any) => Number.isFinite(x.lat) && Number.isFinite(x.lon) && x.lat !== 0);
        } catch {
          return [];
        }
      };
      const attractions = await fetchItems(`${dest} tourist attractions`);
      const restaurants = await fetchItems(`${dest} restaurants`);
      // Geocoding for `dest` can fail while place search still returns real coordinates —
      // without this, distances are computed from (0,0), producing multi-day travel times.
      if (center.lat === 0 && center.lon === 0) {
        const anyPlace = attractions[0] || restaurants[0];
        if (anyPlace) center = { lat: anyPlace.lat, lon: anyPlace.lon, display: dest };
      }
      const pickNearest = (from: { lat: number; lon: number }, pool: any[]) => {
        if (!pool.length) return null;
        let best = pool[0];
        let bd = toKm(from.lat, from.lon, best.lat, best.lon);
        for (let i = 1; i < pool.length; i++) {
          const d = toKm(from.lat, from.lon, pool[i].lat, pool[i].lon);
          if (d < bd) {
            bd = d;
            best = pool[i];
          }
        }
        return best;
      };
      const daysOut: any[] = [];
      let remaining = attractions.slice(0);
      let remainingRestaurants = restaurants.slice(0);
      const nextRestaurant = (from: { lat: number; lon: number }) => {
        if (!remainingRestaurants.length) {
          // Reuse the full pool once exhausted rather than repeating the same
          // pick forever, but never re-include a restaurant on the immediate
          // next meal by excluding whichever restaurant closes out cursor.
          remainingRestaurants = restaurants.slice(0);
        }
        const pick = pickNearest(from, remainingRestaurants);
        if (pick) remainingRestaurants = remainingRestaurants.filter((x: any) => x.id !== pick.id);
        return pick;
      };
      for (let d = 0; d < days; d++) {
        let cursor = { lat: center.lat, lon: center.lon };
        let h = Math.floor(startHour);
        let m = Math.round((startHour - Math.floor(startHour)) * 60);
        const acts: any[] = [];
        acts.push({
          time: fmt(h, m),
          placeName: "Wake up",
          address: center.display,
          type: "park",
          entryFeeINR: 0,
          duration_minutes: 0,
          localFoodRecommendations: [],
          routeFromPrevious: {
            mode: travelMedium,
            distance_km: 0,
            travel_time_minutes: 0,
            from: "Accommodation",
            to: "Start",
          },
        });
        let count = 0;
        while (count < 3 && remaining.length) {
          const next = pickNearest(cursor, remaining);
          if (!next) break;
          const dist = toKm(cursor.lat, cursor.lon, next.lat, next.lon);
          const tt = travelTime(dist);
          const dep = addMinutes(h, m, tt);
          const at = dep;
          const end = addMinutes(at.h, at.m, activityDuration);
          acts.push({
            time: fmt(at.h, at.m),
            placeName: next.name,
            address: next.address,
            type: "sightseeing",
            entryFeeINR: 0,
            duration_minutes: activityDuration,
            localFoodRecommendations: [],
            routeFromPrevious: {
              mode: travelMedium,
              distance_km: Math.round(dist * 10) / 10,
              travel_time_minutes: tt,
              from: "Previous",
              to: next.name,
            },
          });
          const buf = addMinutes(end.h, end.m, bufferMin);
          h = buf.h;
          m = buf.m;
          cursor = { lat: next.lat, lon: next.lon };
          remaining = remaining.filter((x: any) => x.id !== next.id);
          count++;
          if (h >= lunchHour && h < lunchHour + 2) {
            const lunchPick = nextRestaurant(cursor) || null;
            const ldist = lunchPick
              ? toKm(cursor.lat, cursor.lon, lunchPick.lat, lunchPick.lon)
              : 0;
            const ltt = travelTime(ldist);
            const ldep = addMinutes(h, m, Math.max(0, lunchHour * 60 - (h * 60 + m)) + ltt);
            const lstart = ldep;
            const lend = addMinutes(lstart.h, lstart.m, 60);
            acts.push({
              time: fmt(lstart.h, lstart.m),
              placeName: lunchPick ? lunchPick.name : "Lunch",
              address: lunchPick ? lunchPick.address : center.display,
              type: "restaurant",
              entryFeeINR: 0,
              duration_minutes: 60,
              localFoodRecommendations: [],
              routeFromPrevious: {
                mode: travelMedium,
                distance_km: Math.round(ldist * 10) / 10,
                travel_time_minutes: ltt,
                from: "Previous",
                to: lunchPick ? lunchPick.name : "Lunch",
              },
            });
            const lbuf = addMinutes(lend.h, lend.m, bufferMin);
            h = lbuf.h;
            m = lbuf.m;
            if (lunchPick) cursor = { lat: lunchPick.lat, lon: lunchPick.lon };
          }
        }
        if (h < dinnerHour) {
          const dinnerPick = nextRestaurant(cursor) || null;
          const ddist = dinnerPick
            ? toKm(cursor.lat, cursor.lon, dinnerPick.lat, dinnerPick.lon)
            : 0;
          const dtt = travelTime(ddist);
          const ddep = addMinutes(h, m, Math.max(0, dinnerHour * 60 - (h * 60 + m)) + dtt);
          const dstart = ddep;
          const dend = addMinutes(dstart.h, dstart.m, 75);
          acts.push({
            time: fmt(dstart.h, dstart.m),
            placeName: dinnerPick ? dinnerPick.name : "Dinner",
            address: dinnerPick ? dinnerPick.address : center.display,
            type: "restaurant",
            entryFeeINR: 0,
            duration_minutes: 75,
            localFoodRecommendations: [],
            routeFromPrevious: {
              mode: travelMedium,
              distance_km: Math.round(ddist * 10) / 10,
              travel_time_minutes: dtt,
              from: "Previous",
              to: dinnerPick ? dinnerPick.name : "Dinner",
            },
          });
          const dbuf = addMinutes(dend.h, dend.m, bufferMin);
          h = dbuf.h;
          m = dbuf.m;
        }
        acts.push({
          time: fmt(h, m),
          placeName: "Return to accommodation",
          address: center.display,
          type: "park",
          entryFeeINR: 0,
          duration_minutes: 0,
          localFoodRecommendations: [],
          routeFromPrevious: {
            mode: travelMedium,
            distance_km: 0,
            travel_time_minutes: 0,
            from: "Dinner",
            to: "Accommodation",
          },
        });
        daysOut.push({ day: d + 1, activities: acts });
      }
      const perDayFood = pace === "relaxed" ? 1200 : pace === "fast" ? 900 : 1000;
      const perDayTransport =
        travelMedium === "walk" ? 200 : travelMedium === "transit" ? 400 : 600;
      const perDayActivities = 800;
      const perDayAccommodation = 1500;
      const totalINR =
        days * (perDayFood + perDayTransport + perDayActivities + perDayAccommodation) * persons;
      const costBreakdown = {
        accommodationINR: perDayAccommodation * days * persons,
        foodINR: perDayFood * days * persons,
        transportINR: perDayTransport * days * persons,
        activitiesINR: perDayActivities * days * persons,
        miscINR: Math.round(totalINR * 0.05),
        totalINR,
      };
      // Generate contextual packing list based on trip details
      const basePackingList = ["Phone Charger", "Toothbrush", "First Aid Kit", "Travel Documents"];
      let packingList = [...basePackingList];

      // Add international items
      if (tripForm.isInternational) {
        packingList.push("Passport", "Visa Documents", "Travel Adapter");
      }

      // Add weather-based items
      try {
        const weatherRes = await apiRequest(
          "GET",
          `/api/v1/weather?city=${encodeURIComponent(dest)}`,
        );
        const weatherData = await weatherRes.json();
        const temp = Number(weatherData?.current?.temperature ?? 22);
        const cond = String(weatherData?.current?.condition || "").toLowerCase();
        const hum = Number(weatherData?.current?.humidity ?? 60);

        if (cond.includes("rain")) {
          packingList.push("Umbrella", "Raincoat", "Waterproof Shoes", "Extra Socks");
        }
        if (cond.includes("snow") || temp <= 15) {
          packingList.push("Warm Jacket", "Thermal Wear", "Gloves", "Scarf", "Beanie");
        }
        if (cond.includes("sun") || temp >= 28) {
          packingList.push("Sunscreen", "Sunglasses", "Hat", "Light Clothing", "Water Bottle");
        }
        if (hum >= 70) {
          packingList.push("Mosquito Repellent", "Anti-chafing Powder");
        }
      } catch {}

      // Add transport-specific items
      if (travelMedium === "flight") {
        packingList.push("Neck Pillow", "Eye Mask", "Earplugs", "Power Bank");
      } else if (travelMedium === "train") {
        packingList.push("Travel Pillow", "Snacks", "Water Bottle");
      } else if (travelMedium === "bus") {
        packingList.push("Travel Blanket", "Snacks");
      } else if (travelMedium === "car") {
        packingList.push("Roadside Kit", "Car Documents");
      }

      // Add trip-type specific items
      if (typeOfTrip === "adventure") {
        packingList.push("Comfortable Shoes", "Backpack", "Energy Bars");
      } else if (typeOfTrip === "relaxed") {
        packingList.push("Comfortable Clothes", "Book or E-reader");
      } else if (typeOfTrip === "culinary") {
        packingList.push("Digestive Medicine", "Wet Wipes");
      }

      // Remove duplicates and limit to reasonable number
      packingList = [...new Set(packingList)].slice(0, 15);

      // Initialize selected items with all items when plan is generated
      setSelectedPackingItems(packingList);
      return {
        destination: dest,
        days,
        persons,
        totalEstimatedCost: totalINR,
        currency,
        costBreakdown,
        itinerary: daysOut,
        packingList,
        safetyTips: [
          "Keep copies of documents",
          "Use registered taxis",
          "Stay aware in crowded areas",
        ],
      } as any;
    },
    onSuccess: (planData) => {
      // Automatic trip creation will be handled by useEffect to ensure stability
      console.log("[TripPlanner] Itinerary generated successfully, waiting for save effect...");
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          setLocation("/signin");
        }, 500);
        return;
      }
      const msg = String((error as any)?.message || "");
      if (/^400:/.test(msg)) {
        const desc =
          msg.split(":").slice(1).join(":").trim() ||
          "Invalid input. Please review the form and try again.";
        toast({ title: "Invalid Input", description: desc, variant: "destructive" });
        return;
      }
      if (/^429:/.test(msg)) {
        const desc =
          msg.split(":").slice(1).join(":").trim() ||
          "Too many requests. Please wait a moment and try again.";
        toast({ title: "Rate Limited", description: desc, variant: "destructive" });
        return;
      }
      toast({
        title: "Error",
        description: "Failed to generate itinerary.",
        variant: "destructive",
      });
    },
  });

  // Stabilize trip creation in an effect
  useEffect(() => {
    if (
      planTripMutation.isSuccess &&
      planTripMutation.data &&
      !(planTripMutation.data as any).error &&
      !hasSaved.current
    ) {
      const planData = planTripMutation.data;
      const styleMap: Record<string, string> = {
        adventure: "adventure",
        relaxed: "relaxed",
        cultural: "cultural",
        culinary: "culinary",
      };

      const tripData = {
        origin: tripForm.origin,
        destination: tripForm.destination,
        budget: tripForm.budget
          ? parseFloat(tripForm.budget)
          : planData.costBreakdown?.totalINR || planData.costBreakdown?.total || 0,
        days: parseInt(tripForm.days) || 1,
        groupSize: parseInt(tripForm.groupSize) || 1,
        travelStyle: styleMap[selectedStyle] || "standard",
        transportMode: tripForm.transportMode || undefined,
        isInternational: !!tripForm.isInternational,
        status: "planning" as const,
        notes: tripForm.notes,
        // Was only ever forwarded to /generate-itinerary (to steer the AI
        // draft) and never onto the saved trip itself — TripDetail's
        // Places-tab restaurant search reads trip.cuisinePreferences, so a
        // real saved trip never actually got the cuisine-aware search this
        // was built for.
        cuisinePreferences: tripForm.cuisinePreferences,
        dietaryPreferences: tripForm.dietaryPreferences,
        itinerary: Array.isArray(planData.itinerary)
          ? planData.itinerary.map((day: any, idx: number) => ({
              ...day,
              dayIndex: typeof day.dayIndex === "number" ? day.dayIndex : idx,
              day: day.day || idx + 1,
              activities: Array.isArray(day.activities)
                ? day.activities.map((act: any) => ({
                    ...act,
                    title: act.placeName || act.title || "Activity",
                    address:
                      act.address ||
                      (act.type === "restaurant" ? "Nearby Restaurant" : "Near City Center"),
                  }))
                : [],
            }))
          : [],
        costBreakdown: planData.costBreakdown,
      };

      hasSaved.current = true;
      createTripMutation.mutate(tripData);
    }
  }, [planTripMutation.isSuccess, planTripMutation.data, planTripMutation.status]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const missing = new Set<string>();
    if (!tripForm.origin) missing.add("origin");
    if (!tripForm.destination) missing.add("destination");
    if (!tripForm.days) missing.add("days");
    if (!tripForm.groupSize) missing.add("groupSize");
    if (!selectedStyle) missing.add("travelStyle");

    if (missing.size > 0) {
      setSubmitErrors(missing);
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    setSubmitErrors(new Set());

    // New plan generation — allow auto-save again (Regenerate deliberately skips this).
    hasSaved.current = false;
    planTripMutation.mutate();
  };

  const handleStyleSelect = (styleId: string) => {
    setSelectedStyle(styleId);
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--amber)] mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Navigation Header */}

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-4" data-testid="planner-title">
            Plan Your Perfect Trip
          </h1>
          <p
            className="text-xl text-muted-foreground max-w-2xl mx-auto"
            data-testid="planner-description"
          >
            Tell us your preferences and let AI create a personalized itinerary just for you.
          </p>
        </div>
        {/* Mode Toggle */}
        <div className="flex gap-2 p-1 bg-card border border rounded-xl mb-6">
          <button
            type="button"
            onClick={() => setPlanMode("ai")}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${planMode === "ai" ? "bg-[var(--amber)] text-white shadow" : "text-muted-foreground hover:text-foreground"}`}
          >
            <i className="fas fa-magic mr-2"></i>Let AI Plan
          </button>
          <button
            type="button"
            onClick={() => setPlanMode("import")}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${planMode === "import" ? "bg-[var(--amber)] text-white shadow" : "text-muted-foreground hover:text-foreground"}`}
          >
            <i className="fas fa-paste mr-2"></i>Import My Plan
          </button>
        </div>
        {/* Import My Plan Mode */}
        {planMode === "import" && importPreview && (
          <div className="mb-6">
            <ImportPlanPreview
              plan={importPreview}
              isCreating={createTripMutation.isPending}
              onConfirm={handleConfirmImportTrip}
              onCancel={handleCancelImportPreview}
            />
          </div>
        )}
        {planMode === "import" && !importPreview && (
          <Card className="bg-card border elev-1 mb-6">
            <CardHeader>
              <CardTitle className="text-xl font-bold text-foreground">
                Import Your Schedule
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Paste your travel plan as plain text — AI will structure it into a day-by-day
                itinerary.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleImportSchedule} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">
                    Your Schedule <span className="text-red-500">*</span>
                  </label>
                  <Textarea
                    placeholder={`Paste your travel plan here. For example:\n\nDay 1 - Mumbai to Goa ✈️ (morning flight)\nDay 2 - Baga Beach, then Fort Aguada 🏖️\nDay 3 - Old Goa churches, spice plantation tour\nDay 4 - Dudhsagar Falls day trip 🚗\nDay 5 - Return to Mumbai\n...`}
                    value={importForm.scheduleText}
                    onChange={(e) => {
                      setImportForm((prev) => ({ ...prev, scheduleText: e.target.value }));
                      if (importErrors.scheduleText) {
                        setImportErrors((prev) => {
                          const { scheduleText, ...rest } = prev;
                          return rest;
                        });
                      }
                    }}
                    className={`bg-muted border text-foreground placeholder:text-muted-foreground min-h-[200px] font-mono text-sm ${importErrors.scheduleText ? "border-destructive ring-1 ring-destructive" : ""}`}
                    required
                  />
                  {importErrors.scheduleText && (
                    <p className="text-xs text-destructive mt-1">{importErrors.scheduleText}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">
                      Start Date
                    </label>
                    <Input
                      type="date"
                      value={importForm.startDate}
                      onChange={(e) => {
                        setImportForm((prev) => ({ ...prev, startDate: e.target.value }));
                        if (importErrors.startDate) {
                          setImportErrors((prev) => {
                            const { startDate, ...rest } = prev;
                            return rest;
                          });
                        }
                      }}
                      className={`bg-muted border text-foreground placeholder:text-muted-foreground h-11 ${importErrors.startDate ? "border-destructive ring-1 ring-destructive" : ""}`}
                    />
                    {importErrors.startDate && (
                      <p className="text-xs text-destructive mt-1">{importErrors.startDate}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">
                      Group Size <span className="text-red-500">*</span>
                    </label>
                    <Select
                      value={importForm.groupSize}
                      onValueChange={(value) => {
                        setImportForm((prev) => ({ ...prev, groupSize: value }));
                        if (importErrors.groupSize) {
                          setImportErrors((prev) => {
                            const { groupSize, ...rest } = prev;
                            return rest;
                          });
                        }
                      }}
                    >
                      <SelectTrigger
                        className={`bg-muted border text-foreground placeholder:text-muted-foreground h-11 ${importErrors.groupSize ? "border-destructive ring-1 ring-destructive" : ""}`}
                      >
                        <SelectValue placeholder="Select group size" />
                      </SelectTrigger>
                      <SelectContent position="popper" className="bg-muted border z-50">
                        <SelectItem value="1" className="text-foreground">
                          Solo traveler
                        </SelectItem>
                        <SelectItem value="2" className="text-foreground">
                          Couple (2 people)
                        </SelectItem>
                        <SelectItem value="4" className="text-foreground">
                          Small group (3–5 people)
                        </SelectItem>
                        <SelectItem value="8" className="text-foreground">
                          Large group (6+ people)
                        </SelectItem>
                        <SelectItem value="15" className="text-foreground">
                          Big group (10–20 people)
                        </SelectItem>
                        <SelectItem value="30" className="text-foreground">
                          Group tour (20+ people)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {importErrors.groupSize && (
                      <p className="text-xs text-destructive mt-1">{importErrors.groupSize}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">
                      Budget (optional)
                    </label>
                    <div className="flex gap-2">
                      <Select
                        value={importForm.currency}
                        onValueChange={(value) =>
                          setImportForm((prev) => ({ ...prev, currency: value }))
                        }
                      >
                        <SelectTrigger className="w-[90px] bg-muted border text-foreground placeholder:text-muted-foreground h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper" className="bg-muted border z-50">
                          <SelectItem value="INR" className="text-foreground">
                            ₹ INR
                          </SelectItem>
                          <SelectItem value="USD" className="text-foreground">
                            $ USD
                          </SelectItem>
                          <SelectItem value="EUR" className="text-foreground">
                            € EUR
                          </SelectItem>
                          <SelectItem value="GBP" className="text-foreground">
                            £ GBP
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        placeholder="e.g. 50000"
                        value={importForm.budget}
                        onChange={(e) =>
                          setImportForm((prev) => ({ ...prev, budget: e.target.value }))
                        }
                        className="flex-1 bg-muted border text-foreground placeholder:text-muted-foreground h-11"
                        min="0"
                      />
                    </div>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={isParsing}
                  className="w-full bg-[var(--amber)] text-white py-4 text-base font-semibold rounded-xl disabled:opacity-50"
                >
                  {isParsing ? (
                    <>
                      <i className="fas fa-brain fa-spin mr-2"></i>Parsing Your Schedule...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-wand-magic-sparkles mr-2"></i>Parse Schedule
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
        {/* AI Plan Mode */}
        {planMode === "ai" && (
          <Card className="bg-card border elev-1">
            <CardHeader>
              <CardTitle className="text-xl font-bold text-foreground">Trip Details</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6" data-testid="trip-planning-form">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">
                      Starting Location <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Input
                        type="text"
                        autoFocus
                        // Short enough not to clip in this two-column
                        // layout's ~250px field width at the tablet
                        // breakpoint — the "Starting Location" label above
                        // already carries the full meaning.
                        placeholder="City or airport"
                        value={tripForm.origin}
                        onChange={(e) => {
                          setTripForm((prev) => ({ ...prev, origin: e.target.value }));
                          setShowOriginSuggestions(e.target.value.trim().length >= 3);
                        }}
                        onBlur={() => setTimeout(() => setShowOriginSuggestions(false), 150)}
                        className="bg-muted border text-foreground placeholder:text-muted-foreground"
                        data-testid="input-origin"
                        required
                      />
                      <PlaceSearchDropdown
                        suggestions={originSuggestions}
                        isLoading={originLoading}
                        visible={showOriginSuggestions}
                        onSelect={(place: PlaceSuggestion) => {
                          const name = place.name || place.display_name?.split(",")[0] || "";
                          setTripForm((prev) => ({ ...prev, origin: name }));
                          setShowOriginSuggestions(false);
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">
                      Destination <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Input
                        type="text"
                        placeholder="Your destination"
                        value={tripForm.destination}
                        onChange={(e) => {
                          setTripForm((prev) => ({ ...prev, destination: e.target.value }));
                          setShowDestSuggestions(e.target.value.trim().length >= 3);
                        }}
                        onBlur={() => setTimeout(() => setShowDestSuggestions(false), 150)}
                        className="bg-muted border text-foreground placeholder:text-muted-foreground"
                        required
                        data-testid="input-destination"
                      />
                      <PlaceSearchDropdown
                        suggestions={destSuggestions}
                        isLoading={destLoading}
                        visible={showDestSuggestions}
                        onSelect={(place: PlaceSuggestion) => {
                          const name = place.name || place.display_name?.split(",")[0] || "";
                          setTripForm((prev) => ({ ...prev, destination: name }));
                          setShowDestSuggestions(false);
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">
                      Budget
                    </label>
                    <div className="flex gap-2">
                      <Select
                        value={tripForm.currency}
                        onValueChange={(value) =>
                          setTripForm((prev) => ({ ...prev, currency: value }))
                        }
                      >
                        <SelectTrigger className="w-[100px] bg-muted border text-foreground">
                          <SelectValue placeholder="INR" />
                        </SelectTrigger>
                        <SelectContent position="popper" className="bg-muted border z-50">
                          <SelectItem value="INR" className="text-foreground">
                            ₹ INR
                          </SelectItem>
                          <SelectItem value="USD" className="text-foreground">
                            $ USD
                          </SelectItem>
                          <SelectItem value="GBP" className="text-foreground">
                            £ GBP
                          </SelectItem>
                          <SelectItem value="EUR" className="text-foreground">
                            € EUR
                          </SelectItem>
                          <SelectItem value="AUD" className="text-foreground">
                            A$ AUD
                          </SelectItem>
                          <SelectItem value="CAD" className="text-foreground">
                            C$ CAD
                          </SelectItem>
                          <SelectItem value="JPY" className="text-foreground">
                            ¥ JPY
                          </SelectItem>
                          <SelectItem value="CNY" className="text-foreground">
                            ¥ CNY
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        placeholder="75000"
                        value={tripForm.budget}
                        onChange={(e) =>
                          setTripForm((prev) => ({ ...prev, budget: e.target.value }))
                        }
                        className="flex-1 bg-muted border text-foreground placeholder:text-muted-foreground"
                        min="0"
                        data-testid="input-budget"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">
                      Trip Duration <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="number"
                      min="1"
                      placeholder="e.g. 5"
                      value={tripForm.days}
                      onChange={(e) => setTripForm((prev) => ({ ...prev, days: e.target.value }))}
                      className="bg-muted border text-foreground placeholder:text-muted-foreground"
                      required
                      data-testid="input-duration"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">
                      Group Size <span className="text-red-500">*</span>
                    </label>
                    <Select
                      value={tripForm.groupSize}
                      onValueChange={(value) => {
                        setTripForm((prev) => ({ ...prev, groupSize: value }));
                        setSubmitErrors((prev) => {
                          if (!prev.has("groupSize")) return prev;
                          const next = new Set(prev);
                          next.delete("groupSize");
                          return next;
                        });
                      }}
                      required
                    >
                      <SelectTrigger
                        className={`bg-muted border text-foreground ${submitErrors.has("groupSize") ? "border-destructive ring-1 ring-destructive" : ""}`}
                        data-testid="select-group-size"
                      >
                        <SelectValue placeholder="Select group size" />
                      </SelectTrigger>
                      <SelectContent position="popper" className="bg-muted border z-50">
                        <SelectItem value="1" className="text-foreground">
                          Solo traveler
                        </SelectItem>
                        <SelectItem value="2" className="text-foreground">
                          Couple (2 people)
                        </SelectItem>
                        <SelectItem value="4" className="text-foreground">
                          Small group (3-5 people)
                        </SelectItem>
                        <SelectItem value="8" className="text-foreground">
                          Large group (6+ people)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {submitErrors.has("groupSize") && (
                      <p className="text-xs text-destructive mt-1">Group size is required.</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">
                    Travel Style <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {travelStyles.map((style) => (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() => handleStyleSelect(style.id)}
                        style={
                          selectedStyle === style.id
                            ? { borderColor: style.ink, boxShadow: `0 0 0 2px ${style.ink}33` }
                            : undefined
                        }
                        className={`stamp-press relative overflow-hidden rounded-xl h-28 md:h-36 flex flex-col items-center justify-center gap-2 transition-all duration-200 border-2 bg-[hsl(var(--card))] ${
                          selectedStyle === style.id
                            ? "scale-[1.02]"
                            : "border-[hsl(var(--border))] hover:border-[var(--amber-hover-border)]"
                        }`}
                        data-testid={`travel-style-${style.id}`}
                      >
                        <span
                          className={`w-11 h-11 rounded-full flex items-center justify-center ${style.tint}`}
                        >
                          <style.Icon className="w-5 h-5" />
                        </span>
                        <span className="text-sm font-bold text-foreground tracking-wide">
                          {style.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-sans-clean tracking-wide">
                          {style.caption}
                        </span>
                        {selectedStyle === style.id && (
                          <span
                            className="stamp absolute top-2 right-2 text-[9px]"
                            style={{ color: style.ink }}
                          >
                            Chosen
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">
                    Additional Notes
                  </label>
                  <Textarea
                    placeholder="Any specific preferences, requirements, or things you'd like to include in your trip?"
                    value={tripForm.notes}
                    onChange={(e) => setTripForm((prev) => ({ ...prev, notes: e.target.value }))}
                    className="bg-muted border text-foreground placeholder:text-muted-foreground min-h-[100px]"
                    data-testid="textarea-notes"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={createTripMutation.isPending || planTripMutation.isPending}
                  className="w-full bg-[var(--amber)] text-white py-4 radius-md text-lg font-semibold smooth-transition interactive-tap disabled:opacity-50"
                  data-testid="button-create-trip"
                >
                  {createTripMutation.isPending ? (
                    <>
                      <i className="fas fa-save fa-spin mr-2"></i>
                      Finalizing Your Trip...
                    </>
                  ) : planTripMutation.isPending ? (
                    <>
                      <i className="fas fa-brain fa-spin mr-2"></i>
                      Designing Your Experience...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-magic mr-2"></i>
                      Generate My Itinerary
                    </>
                  )}
                </Button>
                {(!tripForm.budget || !tripForm.groupSize) && (
                  <div className="text-xs text-orange-500 mt-2 text-center">
                    Please provide Budget and People for better results.
                  </div>
                )}
              </form>
            </CardContent>
          </Card>
        )}{" "}
        {/* end planMode === 'ai' */}
        {/* Loading Skeleton */}
        {(createTripMutation.isPending || planTripMutation.isPending || isParsing) && (
          <Card className="bg-card border elev-1 mt-8">
            <CardHeader>
              <CardTitle className="text-xl font-bold text-foreground">
                {planTripMutation.isPending
                  ? "Designing Your Perfect Itinerary..."
                  : "Finalizing details..."}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-muted border border rounded-lg p-4 space-y-3">
                    <div className="h-6 w-24 bg-foreground/10 rounded animate-pulse"></div>
                    <div className="space-y-2">
                      <div className="h-4 w-full bg-foreground/10 rounded animate-pulse"></div>
                      <div className="h-4 w-5/6 bg-foreground/10 rounded animate-pulse"></div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        {planTripMutation.data && !planTripMutation.data.error && (
          <div aria-live="polite" aria-atomic="true">
            <Card className="bg-card border elev-1 mt-8" role="region" aria-label="Trip Plan">
              <CardHeader>
                <CardTitle
                  className="text-xl font-bold text-foreground"
                  tabIndex={-1}
                  id="trip-plan-heading"
                >
                  Trip Plan — {String(planTripMutation.data.destination || "Unknown Destination")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
                    <div>
                      <div className="text-foreground">Days</div>
                      <div>{Number(planTripMutation.data.days) || ""}</div>
                    </div>
                    <div>
                      <div className="text-foreground">Persons</div>
                      <div>{Number(planTripMutation.data.persons) || ""}</div>
                    </div>
                    <div>
                      <div className="text-foreground">Budget</div>
                      <div>
                        {tripForm.budget
                          ? formatMoney(Number(tripForm.budget), planTripMutation.data.currency)
                          : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-foreground">Estimated Total</div>
                      <div>
                        {formatMoney(
                          planTripMutation.data.totalEstimatedCost,
                          planTripMutation.data.currency,
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-foreground">Currency</div>
                      <div>{String(planTripMutation.data.currency || "INR")}</div>
                    </div>
                  </div>

                  {planTripMutation.data.costBreakdown && (
                    <div>
                      <div className="font-bold text-foreground mb-2">Cost Breakdown</div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm text-muted-foreground">
                        {[
                          "grandTransit",
                          "accommodationINR",
                          "foodINR",
                          "transportINR",
                          "activitiesINR",
                          "miscINR",
                          "totalINR",
                        ].map((k) => (
                          <div key={k}>
                            <span className="text-foreground capitalize">
                              {k === "grandTransit"
                                ? "Travel to Destination"
                                : k.replace("INR", "").replace(/([A-Z])/g, " $1")}
                            </span>
                            <div>
                              {formatMoney(
                                planTripMutation.data.costBreakdown[k],
                                planTripMutation.data.currency,
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    {Array.isArray(planTripMutation.data.itinerary) &&
                      planTripMutation.data.itinerary.map((d: any) => (
                        <Card key={`day-${d.day}`} className="bg-muted border">
                          <CardHeader>
                            <CardTitle className="text-foreground">Day {Number(d.day)}</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            {Array.isArray(d.activities) &&
                              d.activities.map((a: any, idx: number) => (
                                <div key={`act-${d.day}-${idx}`} className="space-y-1">
                                  <div className="flex items-start justify-between">
                                    <div>
                                      <div className="text-sm text-muted-foreground">
                                        {String(a.time)} • {String(a.placeName || a.title || "")}
                                      </div>
                                      {a.address && (
                                        <a
                                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.address)}`}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-xs text-[var(--amber)] underline"
                                        >
                                          {String(a.address)}
                                        </a>
                                      )}
                                    </div>
                                    <div className="text-sm text-green-500">
                                      {typeof a.entryFeeINR === "number" && a.entryFeeINR > 0
                                        ? formatMoney(a.entryFeeINR, planTripMutation.data.currency)
                                        : ""}
                                    </div>
                                  </div>
                                  {Array.isArray(a.localFoodRecommendations) &&
                                    a.localFoodRecommendations.length > 0 && (
                                      <div className="flex flex-wrap gap-2">
                                        {a.localFoodRecommendations.map((f: any, i: number) => (
                                          <span
                                            key={`food-${i}`}
                                            className="text-xs bg-card text-foreground px-2 py-1 rounded-full"
                                          >
                                            {String(f)}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                </div>
                              ))}
                          </CardContent>
                        </Card>
                      ))}
                  </div>

                  {Array.isArray(planTripMutation.data.packingList) && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-bold text-foreground">
                          Packing List - Select Items to Save
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setSelectedPackingItems(planTripMutation.data.packingList)
                            }
                            className="text-xs bg-muted border text-foreground hover:bg-card"
                            data-testid="button-select-all-packing"
                          >
                            Select All
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedPackingItems([])}
                            className="text-xs bg-muted border text-foreground hover:bg-card"
                            data-testid="button-deselect-all-packing"
                          >
                            Deselect All
                          </Button>
                        </div>
                      </div>
                      <ul className="text-sm text-muted-foreground space-y-2">
                        {planTripMutation.data.packingList.map((p: any, i: number) => {
                          const itemName = String(p);
                          const isSelected = selectedPackingItems.includes(itemName);
                          return (
                            <li key={`pack-${i}`} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedPackingItems((prev) => [...prev, itemName]);
                                  } else {
                                    setSelectedPackingItems((prev) =>
                                      prev.filter((item) => item !== itemName),
                                    );
                                  }
                                }}
                                aria-label={`Pack ${p}`}
                                className="cursor-pointer"
                                data-testid={`checkbox-pack-${i}`}
                              />
                              <span
                                className={
                                  isSelected
                                    ? "text-foreground"
                                    : "text-muted-foreground line-through"
                                }
                              >
                                {itemName}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                      <p className="text-xs text-muted-foreground mt-2">
                        <i className="fas fa-info-circle mr-1"></i>
                        {selectedPackingItems.length} of {planTripMutation.data.packingList.length}{" "}
                        items selected
                      </p>
                    </div>
                  )}

                  {Array.isArray(planTripMutation.data.safetyTips) && (
                    <div>
                      <div className="font-bold text-foreground mb-2">Safety Tips</div>
                      <ul className="list-disc ml-6 text-sm text-muted-foreground">
                        {planTripMutation.data.safetyTips.map((s: any, i: number) => (
                          <li key={`safe-${i}`}>{String(s)}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <Button
                      onClick={() => {
                        const styleMap: Record<string, string> = {
                          adventure: "adventure",
                          relaxed: "relaxed",
                          cultural: "cultural",
                          culinary: "culinary",
                        };
                        const planData = planTripMutation.data as any;
                        createTripMutation.mutate({
                          origin: tripForm.origin,
                          destination: tripForm.destination,
                          budget: tripForm.budget ? Number(tripForm.budget) : 0,
                          days: Number(tripForm.days || 1),
                          groupSize: Number(tripForm.groupSize || 1),
                          travelStyle: styleMap[selectedStyle] || "standard",
                          transportMode: tripForm.transportMode || undefined,
                          isInternational: !!tripForm.isInternational,
                          status: "planning" as const,
                          notes: tripForm.notes,
                          cuisinePreferences: tripForm.cuisinePreferences,
                          dietaryPreferences: tripForm.dietaryPreferences,
                          itinerary: Array.isArray(planData?.itinerary)
                            ? planData.itinerary.map((day: any, idx: number) => ({
                                ...day,
                                dayIndex: typeof day.dayIndex === "number" ? day.dayIndex : idx,
                                day: day.day || idx + 1,
                                activities: Array.isArray(day.activities)
                                  ? day.activities.map((act: any) => ({
                                      ...act,
                                      title: act.placeName || act.title || "Activity",
                                      address:
                                        act.address ||
                                        (act.type === "restaurant"
                                          ? "Nearby Restaurant"
                                          : "Near City Center"),
                                    }))
                                  : [],
                              }))
                            : [],
                          costBreakdown: planData?.costBreakdown,
                        });
                      }}
                      className="bg-[var(--amber)]"
                    >
                      Save Trip
                    </Button>
                    <Button variant="outline" onClick={() => window.print()}>
                      Export as PDF
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        const shareData = {
                          title: "Trip Plan",
                          text: `Plan for ${planTripMutation.data.destination}`,
                          url: window.location.href,
                        };
                        if (navigator.share) navigator.share(shareData as any);
                        else navigator.clipboard?.writeText(shareData.url);
                      }}
                    >
                      Share
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        if (!planTripMutation.isPending) {
                          hasSaved.current = false;
                          planTripMutation.mutate();
                        }
                      }}
                      disabled={planTripMutation.isPending}
                    >
                      Regenerate Plan
                    </Button>
                  </div>

                  {import.meta.env.DEV && (
                    <details className="mt-4">
                      <summary className="text-muted-foreground">
                        View Raw AI Output (dev only)
                      </summary>
                      <pre className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap bg-muted p-3 rounded-xl">
                        {JSON.stringify(planTripMutation.data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        {planTripMutation.data && planTripMutation.data.error && (
          <Card className="bg-card border elev-1 mt-8">
            <CardContent className="p-6">
              <div className="text-red-500 font-semibold mb-2">
                We couldn’t parse the plan — try regenerating.
              </div>
              <Button
                variant="secondary"
                onClick={() => planTripMutation.mutate()}
                disabled={planTripMutation.isPending}
              >
                {planTripMutation.isPending ? "Generating…" : "Regenerate"}
              </Button>
              {import.meta.env.DEV && (
                <details className="mt-4">
                  <summary className="text-muted-foreground">View Raw AI Output (dev only)</summary>
                  <pre className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap bg-muted p-3 rounded-xl">
                    {JSON.stringify(planTripMutation.data, null, 2)}
                  </pre>
                </details>
              )}
            </CardContent>
          </Card>
        )}
        {/* AI Tips */}
        <Card className="bg-card border elev-1 mt-8">
          <CardContent className="p-6">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-[var(--amber)] rounded-xl flex items-center justify-center mr-3">
                <i className="fas fa-lightbulb text-foreground"></i>
              </div>
              <h3 className="text-lg font-bold text-foreground">AI Planning Tips</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-muted-foreground">
              <div>
                <p className="mb-2">
                  <i className="fas fa-check text-green-500 mr-2"></i>
                  The more details you provide, the better your personalized itinerary will be.
                </p>
                <p className="mb-2">
                  <i className="fas fa-check text-green-500 mr-2"></i>
                  Budget helps us suggest appropriate accommodations and activities.
                </p>
              </div>
              <div>
                <p className="mb-2">
                  <i className="fas fa-check text-green-500 mr-2"></i>
                  Travel style influences the types of experiences we recommend.
                </p>
                <p className="mb-2">
                  <i className="fas fa-check text-green-500 mr-2"></i>
                  You can always edit and customize your itinerary after it's generated.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
