import { useState, useEffect, useRef, useMemo } from "react";
import { Mountain, Armchair, Landmark, Utensils } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TripMateLogo } from "@/components/TripMateLogo";
import { motion, AnimatePresence } from "framer-motion";
import { TripMap } from "@/components/TripMap";
import { BudgetTracker } from "@/components/budget/BudgetTracker";
import { ItineraryManager } from "@/components/itinerary/ItineraryManager";
import { CollaboratorManager } from "@/components/collaboration/CollaboratorManager";
import { RecapPanel } from "@/components/journal/RecapPanel";
import PresenceBubbles from "@/components/collaboration/PresenceBubbles";
import { useSocket } from "@/hooks/useSocket";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { z } from "zod";
import { logInfo, logError } from "@/lib/logger";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Link, useParams, useLocation } from "wouter";
import { useAuthStore, useTripStore, useAgentStore } from "@/store";
import type { Trip, JournalEntry } from "@/types/api.types";
import { getCurrencySymbol } from "@/lib/currency";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import ReactMarkdown from "react-markdown";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Copy, Check } from "lucide-react";

const travelStyles = [
  { id: "adventure", icon: Mountain, name: "Adventure", color: "text-[var(--customs-blue)]" },
  { id: "relaxed", icon: Armchair, name: "Relaxed", color: "text-amber-500" },
  { id: "cultural", icon: Landmark, name: "Cultural", color: "text-[var(--customs-blue)]" },
  { id: "culinary", icon: Utensils, name: "Culinary", color: "text-emerald-500" },
];

// Tinted pills, not solid fills — matches the app-wide status treatment
// (TripStatusBadge, .stamp). Solid navy + white text read as off-system
// against the light paper ground.
const statusColors = {
  planning:
    "bg-[rgb(var(--customs-blue-rgb)/14%)] text-[var(--customs-blue)] border border-[rgb(var(--customs-blue-rgb)/40%)]",
  active:
    "bg-[rgb(var(--transit-green-rgb)/14%)] text-[var(--transit-green)] border border-[rgb(var(--transit-green-rgb)/40%)]",
  completed:
    "bg-[rgb(var(--stamp-red-rgb)/14%)] text-[var(--stamp-red)] border border-[rgb(var(--stamp-red-rgb)/40%)]",
};

export default function TripDetail() {
  const getWeatherIcon = (condition: string) => {
    const c = (condition || "").toLowerCase();
    if (c.includes("clear") || c.includes("sun")) return "fas fa-sun text-amber-500";
    if (c.includes("rain") || c.includes("drizzle"))
      return "fas fa-cloud-rain text-[var(--customs-blue)]";
    if (c.includes("snow")) return "fas fa-snowflake text-blue-200";
    if (c.includes("storm") || c.includes("thunder")) return "fas fa-bolt text-purple-400";
    return "fas fa-cloud text-muted-foreground";
  };

  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading, isAuthenticated } = useAuthStore();
  const {
    currentTrip: trip,
    fetchTrip,
    setCurrentTrip,
    isLoading: tripLoading,
    error,
    errorStatus,
  } = useTripStore();
  // UX-audit finding: this header rendered Edit/Delete unconditionally —
  // the server correctly rejects a viewer's attempt (and ItineraryManager
  // already gates its own controls this way), but a viewer-role
  // collaborator would still SEE a red Delete button on someone else's
  // trip, which reads as broken/untrustworthy even though it's blocked.
  const currentUserId = String((user as any)?._id || (user as any)?.id || "");
  const isOwner = !!trip && String((trip as any).userId) === currentUserId;
  const collaboratorEntry = trip?.collaborators?.find((c: any) => {
    const cId =
      typeof c.userId === "string" ? c.userId : String(c.userId?._id || c.userId?.id || "");
    return cId === currentUserId;
  });
  const canEditTrip = isOwner || collaboratorEntry?.role === "editor";
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  // Share link — UX-audit finding: shareTrip/getPublicTrip were fully
  // built and hardened server-side with zero client entry point. Owner
  // only, matching the server (shareTrip scopes to { _id, userId }).
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const { toast, dismiss } = useToast();
  const activeToastId = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const socketRef = useSocket();
  const { setContext, toggleChat, sendMessage, isChatOpen } = useAgentStore();

  useEffect(() => {
    if (id) {
      setContext({ currentTripId: id });
    }
    return () => setContext({ currentTripId: undefined });
  }, [id, setContext]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !id) return;

    socket.on("trip-mutation", (mutation: { type: string; data?: any }) => {
      // Invalidate relevant queries based on mutation type
      if (mutation.type === "itinerary-updated") {
        fetchTrip(id);
      } else if (mutation.type === "expenses-updated") {
        fetchTrip(id);
      } else if (mutation.type === "packing-updated" || mutation.type === "packing-deleted") {
        queryClient.invalidateQueries({ queryKey: ["/api/v1/packing-lists"] });
      } else if (mutation.type === "journal-updated" || mutation.type === "journal-deleted") {
        queryClient.invalidateQueries({ queryKey: ["/api/v1/journal"] });
      } else if (mutation.type === "collaborators-updated") {
        fetchTrip(id);
        // CollaboratorManager keeps its own separate React Query cache
        // (["trips", id, "collaborators"]) rather than reading trip.collaborators
        // off this Zustand store — fetchTrip alone never touched it, so a
        // collaborator added from another tab/device/session left an
        // already-open "Manage Trip Team" dialog stuck showing stale data.
        queryClient.invalidateQueries({ queryKey: ["trips", id, "collaborators"] });
      } else if (mutation.type === "trip-updated") {
        fetchTrip(id);
      }

      toast({
        title: "Live Update",
        description: `A collaborator updated the ${mutation.type.split("-")[0]}.`,
      });
    });

    socket.on("atlas-thinking", ({ isThinking }: { isThinking: boolean }) => {
      setIsAtlasThinking(isThinking);
    });

    return () => {
      socket.off("trip-mutation");
      socket.off("atlas-thinking");
    };
  }, [id, queryClient, socketRef, toast, fetchTrip]);

  const [isEditing, setIsEditing] = useState(false);
  // Drives the main Tabs below (was uncontrolled — defaultValue only sets
  // the initial tab, there was no way to jump to a tab programmatically)
  // and the "View on Map" flow: itinerary -> map tab + fly to that pin.
  const [activeMainTab, setActiveMainTab] = useState("overview");
  const [mapFocusTarget, setMapFocusTarget] = useState<{
    lat: number;
    lon: number;
    label?: string;
  } | null>(null);
  // label is required for a Places-tab search result: that place isn't in
  // the itinerary, so TripMap has no marker already built for it — without
  // a name to put on an ad-hoc marker, the "View on Map" click flew the
  // camera to empty coordinates with no pin and no popup at all
  // (live-reported). Itinerary activities already have a real marker built
  // from the itinerary array, so label is redundant (but harmless) there.
  const handleViewOnMap = (lat: number, lon: number, label?: string) => {
    setActiveMainTab("map");
    // A fresh object even for the same coordinates twice in a row, so
    // TripMap's focus effect (which keys off reference identity via the
    // dependency array) fires again on a second click of the same pin.
    setMapFocusTarget({ lat, lon, label });
  };

  // The reverse: map pin popup -> jump to Itinerary and scroll to/highlight
  // that activity's row.
  const [highlightActivityId, setHighlightActivityId] = useState<string | null>(null);
  const [highlightNonce, setHighlightNonce] = useState(0);
  const handleViewInItinerary = (activityId: string) => {
    setActiveMainTab("itinerary");
    setHighlightActivityId(activityId);
    setHighlightNonce((n) => n + 1); // same id twice in a row still re-triggers the scroll/highlight
  };
  const [heroImgError, setHeroImgError] = useState(false);
  const [isAtlasThinking, setIsAtlasThinking] = useState(false);
  const [tripForm, setTripForm] = useState({
    origin: "",
    destination: "",
    budget: "",
    days: "",
    groupSize: "",
    travelStyle: "",
    status: "planning" as "planning" | "active" | "completed",
    notes: "",
    startDate: "",
    endDate: "",
  });

  const [aiBudget, setAiBudget] = useState("");
  const [aiGroupSize, setAiGroupSize] = useState("");
  const [aiNotes, setAiNotes] = useState("");
  const [planStage, setPlanStage] = useState<"idle" | "fetching" | "generating" | "done" | "error">(
    "idle",
  );
  const [showHotels, setShowHotels] = useState(false);
  const [showRestaurants, setShowRestaurants] = useState(false);
  const [showSpots, setShowSpots] = useState(false);

  // Itinerary "View" button for a restaurant/cafe/hotel activity — jumps to
  // Places and turns on the matching category toggle so results are
  // immediately visible instead of landing on an empty tab the user then
  // has to know to click into themselves. placeName targets the search at
  // that exact place — live-reported: clicking View on "Sri Rudra Biryani
  // Palace" landed on a generic "restaurants near <destination>" list that
  // didn't contain it at all, since the category browse query never knew
  // which place was clicked. placesTarget overrides that generic query
  // with a name-specific one (see foodResults/hotelResults below) so the
  // clicked place actually shows up, and drives a highlight on its card.
  const [placesTarget, setPlacesTarget] = useState<{
    name: string;
    category: "food" | "hotels";
  } | null>(null);
  const handleViewInPlaces = (category: "food" | "hotels", placeName?: string) => {
    setActiveMainTab("places");
    setPlacesTarget(placeName ? { name: placeName, category } : null);
    if (category === "hotels") setShowHotels(true);
    else setShowRestaurants(true);
  };
  const [openApiLocations, setOpenApiLocations] = useState<
    Array<{
      id: string;
      name_en: string;
      name_local: string;
      transliteration: string;
      road?: string;
      city?: string;
      country: string;
      postcode?: string;
      lat: number;
      lon: number;
      display_name: string;
      source: string;
    }>
  >([]);
  const [openApiPlanning, setOpenApiPlanning] = useState<
    Array<{
      id: string;
      title: string;
      coords: { lat: number; lon: number };
      address: string;
      displayName: string;
    }>
  >([]);

  useEffect(() => {
    if (planStage === "fetching" || planStage === "generating" || planStage === "done") {
      try {
        dismiss();
        activeToastId.current = null;
      } catch {}
    }
  }, [planStage]);

  useEffect(() => {
    setHeroImgError(false);
  }, [trip?.imageUrl]);

  const {
    data: hotelResults,
    isLoading: hotelsLoading,
    isError: hotelsError,
    refetch: refetchHotels,
  } = useQuery<any>({
    queryKey: ["places_hotels", id, tripForm.destination, placesTarget],
    enabled: showHotels && !!tripForm.destination,
    queryFn: async () => {
      const hotelQuery =
        placesTarget?.category === "hotels" && placesTarget.name
          ? `${placesTarget.name} ${tripForm.destination || ""}`
          : "hotels near " + String(tripForm.destination || "");
      const r = await apiRequest(
        "GET",
        `/api/v1/places/search?query=${encodeURIComponent(hotelQuery)}&pageSize=10`,
      );
      // A failed search (rate-limited, upstream error) used to come back
      // through here indistinguishable from a genuine zero-result search
      // — both silently returned [] and rendered the same "No hotels
      // found", which reads as "this destination has none" when the real
      // story is "the search itself failed". Throwing here lets the
      // empty-state below tell them apart.
      if (!r.ok) throw new Error(`places search failed: ${r.status}`);
      const j = await r.json();
      return Array.isArray(j?.items) ? j.items : [];
    },
  });

  // Was a flat "restaurants near {destination}" for every trip regardless
  // of what the traveler actually eats — now folds in whatever cuisine/
  // dietary preferences were set at trip creation (Profile.tsx has the
  // same fields as a saved default; TripPlanner.tsx prefills from there
  // but this trip's own values, not the profile's, are the source of
  // truth here since they can diverge after trip creation).
  const cuisinePrefs = (trip as any)?.cuisinePreferences as string[] | undefined;
  const dietaryPrefs = (trip as any)?.dietaryPreferences as string[] | undefined;
  const restaurantQuery = [...(cuisinePrefs || []), ...(dietaryPrefs || [])].join(" ").trim()
    ? `${[...(cuisinePrefs || []), ...(dietaryPrefs || [])].join(" ")} restaurants near ${tripForm.destination || ""}`
    : `restaurants near ${tripForm.destination || ""}`;
  const {
    data: foodResults,
    isLoading: foodLoading,
    isError: foodError,
    refetch: refetchFood,
  } = useQuery<any>({
    queryKey: ["places_food", id, tripForm.destination, cuisinePrefs, dietaryPrefs, placesTarget],
    enabled: showRestaurants && !!tripForm.destination,
    queryFn: async () => {
      const query =
        placesTarget?.category === "food" && placesTarget.name
          ? `${placesTarget.name} ${tripForm.destination || ""}`
          : restaurantQuery;
      const r = await apiRequest(
        "GET",
        `/api/v1/places/search?query=${encodeURIComponent(query)}&pageSize=10`,
      );
      // See hotelResults' queryFn above for why this throws instead of
      // silently returning [] on failure.
      if (!r.ok) throw new Error(`places search failed: ${r.status}`);
      const j = await r.json();
      return Array.isArray(j?.items) ? j.items : [];
    },
  });

  const {
    data: sightsResults,
    isLoading: sightsLoading,
    isError: sightsError,
    refetch: refetchSights,
  } = useQuery<any>({
    queryKey: ["places_sights", id, tripForm.destination],
    enabled: showSpots && !!tripForm.destination,
    queryFn: async () => {
      // Use the generic search endpoint which is more reliable (uses Google Places + fallbacks)
      // instead of the dedicated tourist-attractions endpoint which uses Overpass and can be flaky (502 errors)
      const r = await apiRequest(
        "GET",
        `/api/v1/places/search?query=${encodeURIComponent("tourist attractions in " + String(tripForm.destination || ""))}&pageSize=10`,
      );
      // See hotelResults' queryFn above for why this throws instead of
      // silently returning [] on failure.
      if (!r.ok) throw new Error(`places search failed: ${r.status}`);
      const j = await r.json();
      return Array.isArray(j?.items) ? j.items : [];
    },
  });

  const {
    data: weather,
    isLoading: weatherLoading,
    isError: weatherError,
  } = useQuery<any>({
    queryKey: ["weather_forecast", tripForm.destination],
    enabled: !!tripForm.destination,
    queryFn: async () => {
      const url = `/api/v1/weather?city=${encodeURIComponent(String(tripForm.destination || ""))}&units=metric&lang=en`;
      const r = await apiRequest("GET", url);
      const j = await r.json();
      return j;
    },
    refetchOnWindowFocus: false,
  });

  const { data: hacks } = useQuery<any>({
    queryKey: ["trip_hacks", id],
    enabled: !!id && isAuthenticated,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/v1/trips/${id}/hacks`);
      return res.json();
    },
  });

  const { data: quietPlaces, isLoading: quietLoading } = useQuery<any>({
    queryKey: ["trip_quiet_places", id],
    enabled: !!id && isAuthenticated,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/v1/trips/${id}/quiet-places`);
      return res.json();
    },
  });

  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (tripForm.destination) {
      // apiRequest (not raw fetch) — attaches credentials + CSRF token the
      // same as every other data fetch in this file; the raw fetch here
      // silently dropped the auth cookie in some cross-origin setups and
      // made this specific coordinates-for-map lookup unreliable.
      apiRequest("GET", `/api/v1/geocode?q=${encodeURIComponent(tripForm.destination)}`)
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data) && data.length > 0) {
            setCoords({ lat: Number(data[0].lat), lon: Number(data[0].lon) });
          }
        })
        .catch((err) => logError("[TripDetail] geocode lookup failed", err));
    }
  }, [tripForm.destination]);

  useEffect(() => {
    try {
      const count = Array.isArray(sightsResults) ? sightsResults.length : 0;
      if (tripForm.destination && count >= 0) {
        logInfo("tourist_spots_shown", { destination: String(tripForm.destination), count });
      }
    } catch {}
  }, [sightsResults, tripForm.destination]);

  const segments = useMemo(() => {
    const arr = openApiPlanning.slice(0, 8);
    const rad = (d: number) => (d * Math.PI) / 180;
    const distKm = (a: any, b: any) => {
      const R = 6371;
      const dLat = rad(b.coords.lat - a.coords.lat);
      const dLon = rad(b.coords.lon - a.coords.lon);
      const lat1 = rad(a.coords.lat);
      const lat2 = rad(b.coords.lat);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
      const c = 2 * Math.asin(Math.min(1, Math.sqrt(h)));
      return R * c;
    };
    const segs: Array<{ from: any; to: any; km: number; mins: number; mode: string }> = [];
    for (let i = 1; i < arr.length; i++) {
      const a = arr[i - 1],
        b = arr[i];
      const km = distKm(a, b);
      const mode = km < 2 ? "walk" : "transit";
      const speedKmh = mode === "walk" ? 4.5 : 20;
      const mins = Math.round((km / speedKmh) * 60);
      segs.push({ from: a, to: b, km: Math.round(km * 10) / 10, mins, mode });
    }
    return segs;
  }, [openApiPlanning]);

  useEffect(() => {
    try {
      logInfo("trip_detail_access_attempt", { tripId: id, isAuthenticated });
    } catch {}
  }, [id, isAuthenticated]);

  // Was firing unconditionally on mount — on a hard reload, checkSession()
  // and this fetch raced, so a transient blip (auth not confirmed yet, a
  // slow cold-start response, a dropped connection) permanently landed the
  // page on "Trip Not Found" with no way to recover short of a second
  // manual reload. Now waits for auth to resolve (matching the
  // hotel/restaurant queries elsewhere in this file, which already gate on
  // isAuthenticated) and auto-retries once on failure before giving up.
  const retryCountRef = useRef(0);
  useEffect(() => {
    if (id && !authLoading && isAuthenticated) {
      retryCountRef.current = 0;
      fetchTrip(id);
    }
  }, [id, authLoading, isAuthenticated, fetchTrip]);

  useEffect(() => {
    if (error && !tripLoading && !trip && id && retryCountRef.current < 1) {
      retryCountRef.current += 1;
      const t = setTimeout(() => fetchTrip(id), 1200);
      return () => clearTimeout(t);
    }
  }, [error, tripLoading, trip, id, fetchTrip]);

  const retryTripFetch = () => {
    retryCountRef.current = 0;
    if (id) fetchTrip(id);
  };

  useEffect(() => {
    if (error && isUnauthorizedError(error)) {
      try {
        logError("trip_detail_unauthorized", { tripId: id });
      } catch {}
    }
  }, [error, id]);

  // Auto-fetch hero image if missing
  useEffect(() => {
    if (trip && !trip.imageUrl && isAuthenticated) {
      apiRequest("POST", `/api/v1/trips/${id}/image`)
        .then((res) => res.json())
        .then((data) => {
          if (data.imageUrl) {
            setCurrentTrip({ ...trip, imageUrl: data.imageUrl, imageCaption: data.imageCaption });
          }
        })
        .catch(() => {});
    }
  }, [trip, id, isAuthenticated, setCurrentTrip]);

  const { data: journalEntries } = useQuery<JournalEntry[]>({
    queryKey: ["/api/v1/journal"],
  });

  const updateTripMutation = useMutation({
    mutationFn: async (updates: Partial<Trip>) => {
      const response = await apiRequest("PUT", `/api/v1/trips/${id}`, updates);
      return response.json();
    },
    onSuccess: () => {
      fetchTrip(id);
      // Prefix matching only catches an exact-element match, so this alone
      // misses queries keyed on the full URL string '/api/v1/trips?light=true'
      // (one element, not a nested array) — pages using the light variant
      // (e.g. packing list's trip picker) kept showing stale data.
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/api/v1/trips"),
      });
      toast({
        title: "Trip Updated",
        description: "Your trip has been updated successfully.",
      });
      setIsEditing(false);
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        try {
          logError("trip_update_unauthorized", { tripId: id });
        } catch {}
      }
      toast({
        title: "Error",
        description: "Failed to update trip.",
        variant: "destructive",
      });
    },
  });

  const deleteTripMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/api/v1/trips/${id}`);
      return response;
    },
    onSuccess: () => {
      // Prefix matching only catches an exact-element match, so this alone
      // misses queries keyed on the full URL string '/api/v1/trips?light=true'
      // (one element, not a nested array) — pages using the light variant
      // (e.g. packing list's trip picker) kept showing stale data.
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/api/v1/trips"),
      });
      toast({
        title: "Trip Deleted",
        description: "Your trip has been deleted.",
      });
      setLocation("/app/home");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete trip.",
        variant: "destructive",
      });
    },
  });

  const addActivityMutation = useMutation({
    mutationFn: async ({ dayIndex, activity }: { dayIndex: number; activity: any }) => {
      const response = await apiRequest("POST", `/api/v1/trips/${id}/itinerary/activity`, {
        dayIndex,
        activity,
      });
      return response.json();
    },
    onSuccess: () => {
      fetchTrip(id);
      toast({ title: "Activity added", description: "Activity has been added to your itinerary." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add activity.", variant: "destructive" });
    },
  });

  // Places-tab results (hotels/restaurants/tourist spots) had zero path into
  // the trip — the only action was "Open Map", which bounced out to Google
  // Maps in a new tab even though the app already has the place's name,
  // address, and coordinates in hand. Adds it to Day 1 with a sensible type
  // per category; "View on Map" reuses the exact same focus mechanism the
  // Itinerary tab's own "View on map" button uses.
  const addPlaceToItinerary = (place: any, type: "accommodation" | "food" | "sightseeing") => {
    addActivityMutation.mutate({
      dayIndex: 0,
      activity: {
        title: place.name || place.title || "Untitled place",
        placeName: place.name || place.title,
        address: place.address,
        type,
        lat: place.location?.lat,
        lon: place.location?.lng,
        duration_minutes: 60,
      },
    });
  };

  const renderPlaceActions = (place: any, type: "accommodation" | "food" | "sightseeing") => {
    const hasCoords = place.location?.lat != null && place.location?.lng != null;
    return (
      <div className="flex items-center gap-3 mt-2">
        <button
          type="button"
          onClick={() => addPlaceToItinerary(place, type)}
          disabled={addActivityMutation.isPending}
          className="text-xs text-[var(--explorer-blue)] hover:underline inline-flex items-center disabled:opacity-50"
        >
          <i className="fas fa-plus mr-1 text-[10px]"></i> Add to Itinerary
        </button>
        {hasCoords && (
          <button
            type="button"
            onClick={() =>
              handleViewOnMap(place.location.lat, place.location.lng, place.name || place.title)
            }
            className="text-xs text-[var(--explorer-blue)] hover:underline inline-flex items-center"
          >
            View on Map <i className="fas fa-map-marker-alt ml-1 text-[10px]"></i>
          </button>
        )}
      </div>
    );
  };

  const deleteActivityMutation = useMutation({
    mutationFn: async ({ dayIndex, activityId }: { dayIndex: number; activityId: string }) => {
      const response = await apiRequest(
        "DELETE",
        `/api/v1/trips/${id}/itinerary/activity/${activityId}`,
        { dayIndex },
      );
      return response.json();
    },
    onSuccess: () => {
      fetchTrip(id);
      toast({
        title: "Activity deleted",
        description: "Activity has been removed from your itinerary.",
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete activity.", variant: "destructive" });
    },
  });

  const handleMapAddActivity = async (activity: any, dayNumber: number) => {
    addActivityMutation.mutate({ dayIndex: dayNumber - 1, activity });
  };

  const handleMapDeleteActivity = async (dayIndex: number, activityIndex: number) => {
    if (!trip?.itinerary || !Array.isArray(trip.itinerary)) return;
    const day = trip.itinerary[dayIndex];
    if (!day) return;
    if (!day || !day.activities || !day.activities[activityIndex]) return;
    const activity = day.activities[activityIndex];
    deleteActivityMutation.mutate({ dayIndex, activityId: activity.id });
  };

  // Deep link from the dashboard's "Set dates" affordance: /app/trips/:id?edit=1
  // opens straight into the edit form — ONCE. Strip the param immediately so
  // it doesn't re-open the form every time `trip` refetches (e.g. right
  // after a successful save, which was reopening the editor).
  const editDeepLinkHandled = useRef(false);
  useEffect(() => {
    if (editDeepLinkHandled.current) return;
    editDeepLinkHandled.current = true;
    const params = new URLSearchParams(window.location.search);
    if (params.get("edit") === "1") {
      setIsEditing(true);
    }
    // ?tab=itinerary etc. — deep link straight to a tab (dashboard's
    // "Full itinerary →" link).
    const tab = params.get("tab");
    if (tab && ["overview", "itinerary", "map", "budget", "places"].includes(tab)) {
      setActiveMainTab(tab);
    }
    if (params.get("edit") === "1" || tab) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (trip) {
      setTripForm({
        origin: trip.origin || "",
        destination: trip.destination,
        budget: trip.budget?.toString() || "",
        days: trip.days.toString(),
        groupSize: trip.groupSize?.toString() || "",
        travelStyle: trip.travelStyle,
        status: trip.status as "planning" | "active" | "completed",
        notes: trip.notes || "",
        startDate: trip.startDate ? new Date(trip.startDate).toISOString().split("T")[0] : "",
        endDate: trip.endDate ? new Date(trip.endDate).toISOString().split("T")[0] : "",
      });
      setAiBudget(trip.budget?.toString() || "");
      setAiGroupSize(trip.groupSize?.toString() || "");
      setAiNotes(trip.notes || "");
    }
  }, [trip]);

  const handleSave = () => {
    if (!tripForm.destination || !tripForm.days || !tripForm.groupSize || !tripForm.travelStyle) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    const updates = {
      origin: tripForm.origin,
      destination: tripForm.destination,
      budget: tripForm.budget ? parseFloat(tripForm.budget) : undefined,
      days: parseInt(tripForm.days),
      groupSize: parseInt(tripForm.groupSize),
      travelStyle: tripForm.travelStyle as
        | "budget"
        | "standard"
        | "luxury"
        | "adventure"
        | "relaxed"
        | "family"
        | "cultural"
        | "culinary",
      status: tripForm.status,
      notes: tripForm.notes,
      ...(tripForm.startDate
        ? {
            startDate: new Date(tripForm.startDate).toISOString(),
            endDate: (() => {
              const s = new Date(tripForm.startDate);
              const e = tripForm.endDate
                ? new Date(tripForm.endDate)
                : new Date(s.getTime() + (parseInt(tripForm.days) - 1) * 86_400_000);
              return e.toISOString();
            })(),
          }
        : {}),
    };

    updateTripMutation.mutate(updates);
  };

  const handleDelete = () => {
    deleteTripMutation.mutate();
  };

  const toggleShare = async (isPublic: boolean) => {
    if (!id) return;
    setShareLoading(true);
    try {
      const res = await apiRequest("POST", `/api/v1/trips/${id}/share`, { isPublic });
      const updated = await res.json();
      setCurrentTrip(updated);
      toast({
        title: isPublic ? "Link created" : "Link disabled",
        description: isPublic
          ? "Anyone with the link can now view this trip (read-only)."
          : "The share link no longer works.",
      });
    } catch (e) {
      toast({ title: "Couldn't update sharing", variant: "destructive" });
    } finally {
      setShareLoading(false);
    }
  };

  const handleCancel = () => {
    if (trip) {
      setTripForm({
        origin: trip.origin || "",
        destination: trip.destination,
        budget: trip.budget?.toString() || "",
        days: trip.days.toString(),
        groupSize: trip.groupSize?.toString() || "",
        travelStyle: trip.travelStyle,
        status: trip.status as "planning" | "active" | "completed",
        notes: trip.notes || "",
        startDate: trip.startDate ? new Date(trip.startDate).toISOString().split("T")[0] : "",
        endDate: trip.endDate ? new Date(trip.endDate).toISOString().split("T")[0] : "",
      });
    }
    setIsEditing(false);
  };

  const tripJournalEntries =
    journalEntries?.filter((entry) => entry.tripId?.toString() === id) || [];
  // TravelStyle's type allows both "Adventure" and "adventure" (the import-
  // schedule flow can produce either), but travelStyles' own ids are always
  // lowercase — a trip created via that path never matched a style tile
  // here without normalizing case first.
  const selectedStyle = travelStyles.find(
    (style) => style.id === (tripForm.travelStyle || "").toLowerCase(),
  );

  const generatePlanMutation = useMutation({
    mutationFn: async () => {
      const destination = String(tripForm.destination || "").trim();
      if (!destination) throw new Error("400:destination_required");
      // clear any stale toasts before starting a new run
      try {
        dismiss();
      } catch {}
      setPlanStage("fetching");
      logInfo("plan_generate_start", { tripId: id, destination });
      const schema = z.object({
        query: z.string(),
        page: z.number(),
        pageSize: z.number(),
        total: z.number(),
        items: z.array(
          z.object({
            id: z.string(),
            name_en: z.string(),
            name_local: z.string(),
            transliteration: z.string(),
            road: z.string().optional(),
            city: z.string().optional(),
            country: z.string(),
            postcode: z.string().optional(),
            lat: z.number(),
            lon: z.number(),
            display_name: z.string(),
            source: z.string(),
          }),
        ),
      });
      const placesRes = await apiRequest(
        "GET",
        `/api/v1/places/tourist-attractions?location=${encodeURIComponent(destination)}&pageSize=50`,
      );
      const placesJson = await placesRes.json();
      const parsed = schema.safeParse(placesJson);
      if (!parsed.success) {
        logError("open_api_invalid_format", {
          destination,
          error: String(parsed.error?.message || parsed.error),
        });
        throw new Error("invalid_response_format");
      }
      const items = parsed.data.items;
      logInfo("open_api_success", { destination, count: items.length });
      const planning = items.map((i) => ({
        id: i.id,
        title: i.name_en,
        coords: { lat: i.lat, lon: i.lon },
        address: [i.road, i.city, i.country, i.postcode].filter(Boolean).join(", "),
        displayName: i.display_name,
      }));
      setOpenApiLocations(items);
      setOpenApiPlanning(planning);
      setPlanStage("generating");
      const payload = {
        location: tripForm.destination,
        budget: aiBudget ? parseFloat(aiBudget) : (trip?.budget ?? undefined),
        people: aiGroupSize
          ? parseInt(aiGroupSize)
          : trip?.groupSize
            ? parseInt(trip.groupSize.toString())
            : undefined,
        notes: aiNotes || tripForm.notes || undefined,
        days: parseInt(tripForm.days),
        travelStyle: tripForm.travelStyle,
        transportMode: trip?.transportMode || undefined,
      };
      const makeRequest = async () => {
        const response = await apiRequest("POST", `/api/v1/trips/${id}/ai-plan`, payload);
        const json = await response.json();
        logInfo("ai_plan_success", { tripId: id, destination });
        return json;
      };

      try {
        return await makeRequest();
      } catch (error) {
        throw error;
      }
    },
    onSuccess: (data: any) => {
      setPlanStage("done");
      const already = !!(data && (data as any).__alreadyGenerated);
      if (!already) {
        fetchTrip(id);
      }
      try {
        dismiss();
        activeToastId.current = null;
      } catch {}
      toast({
        title: already ? "Plan Already Generated" : "AI Plan Generated",
        description: already
          ? "Your existing plan is shown below."
          : "Your plan has been added below.",
      });
      try {
        const el = document.querySelector(".prose.prose-invert");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch {}
    },
    onError: (error) => {
      setPlanStage("error");
      if (isUnauthorizedError(error)) {
        try {
          logError("plan_generate_unauthorized", { tripId: id });
        } catch {}
      }
      const msg = String((error as any)?.message || "");
      if (msg === "invalid_response_format") {
        const t = toast({
          title: "Invalid Response",
          description: "The location data received was not in the expected format.",
          variant: "destructive",
        });
        activeToastId.current = t.id;
        return;
      }
      if (/^400:/.test(msg)) {
        const desc =
          msg.split(":").slice(1).join(":").trim() ||
          "Invalid input. Please review the fields and try again.";
        const t = toast({ title: "Invalid Input", description: desc, variant: "destructive" });
        activeToastId.current = t.id;
        return;
      }
      if (/^429:/.test(msg)) {
        const desc =
          msg.split(":").slice(1).join(":").trim() ||
          "Too many requests. Please wait a moment and try again.";
        const t = toast({ title: "Rate Limited", description: desc, variant: "destructive" });
        activeToastId.current = t.id;
        return;
      }
      const t = toast({
        title: "Error",
        description: msg || "Failed to generate plan.",
        variant: "destructive",
      });
      activeToastId.current = t.id;
      logError("plan_generate_error", { tripId: id, message: msg });
    },
  });

  // Only shown once the auto-retry above has already fired (retryCountRef
  // reaches 1) — a fresh failure gets one silent retry first, so this only
  // renders for something that's actually still broken a second later.
  const hasTripError = !!error && !tripLoading && !trip && retryCountRef.current >= 1;
  if (hasTripError) {
    const isAuthIssue = errorStatus === 401 || errorStatus === 403;
    const isNotFound = errorStatus === 404;
    return (
      <div className=" flex items-center justify-center">
        <Card className="bg-card border-border max-w-md">
          <CardContent className="p-8 text-center">
            <div className="text-[var(--stamp-red)] mb-4">
              <i className="fas fa-exclamation-triangle text-5xl"></i>
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">
              {isAuthIssue ? "Sign In Required" : "Trip Not Found"}
            </h2>
            <p className="text-muted-foreground mb-4">
              {isAuthIssue
                ? "Your session needs to be confirmed before this trip can load."
                : isNotFound
                  ? "The trip you're looking for doesn't exist or you don't have access to it."
                  : "Something went wrong loading this trip. Your connection may be slow or unstable."}
            </p>
            <div className="flex gap-2 justify-center">
              {!isNotFound && (
                <Button
                  variant="outline"
                  onClick={retryTripFetch}
                  className="border-border text-foreground"
                >
                  Try Again
                </Button>
              )}
              <Link href="/">
                <Button className="bg-[var(--customs-blue)] hover:bg-[var(--amber)]">
                  Go Back Home
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Only show the full-page spinner on the true initial load (no trip data
  // yet). Every itinerary/expense/collaborator edit re-fetches the trip in
  // the background via fetchTrip(), which flips this same tripLoading flag —
  // if we unmount the whole page on every one of those, the Tabs component
  // below remounts and resets to its defaultValue, silently kicking the user
  // back to the Overview tab after every save.
  // Also covers the brief window between a first failed fetch and the
  // scheduled auto-retry above — without this, that gap rendered nothing
  // (a blank flash) for ~1.2s before either the retry's spinner or the
  // error screen took over.
  const awaitingRetry = !!error && !tripLoading && !trip && retryCountRef.current < 1;
  if ((tripLoading || awaitingRetry) && !trip) {
    return (
      <div className="">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--customs-blue)] mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading trip details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!trip) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background text-foreground print:bg-white print:text-black">
      {/* Same print pattern as packing/index.tsx: hide chrome, force a
          plain white page, expand anything scroll-clipped. Radix only
          mounts the active TabsContent, so printing from the Itinerary
          tab naturally prints just that tab's content. */}
      <style>{`
        @media print {
          @page { margin: 1cm; size: auto; }
          body, #root, main, .min-h-screen {
            background-color: white !important;
            color: black !important;
            overflow: visible !important;
            height: auto !important;
            width: auto !important;
            position: relative !important;
            display: block !important;
          }
          .no-print, button, [role="tablist"], header, nav, .fixed { display: none !important; }
          .overflow-y-auto, .overflow-hidden { overflow: visible !important; height: auto !important; }
        }
      `}</style>
      {/* Navigation Header */}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 pb-24">
        {/* Trip Header */}
        <div className="mb-5 border-b border-border pb-5">
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground font-sans-clean mb-2.5">
            <button
              onClick={() => setLocation("/app/trips")}
              className="hover:text-foreground transition-colors"
            >
              Trips
            </button>
            <span aria-hidden="true">/</span>
            <span className="text-foreground truncate max-w-[220px]">{trip.destination}</span>
          </nav>
          <div className="flex flex-col lg:flex-row lg:items-start justify-between mb-1 gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1
                  className="font-display text-[1.9rem] sm:text-[2.2rem] lg:text-[2.5rem] leading-[1.05] font-semibold text-foreground"
                  data-testid="trip-title"
                >
                  {trip.destination}
                </h1>
                <Badge
                  className={
                    statusColors[trip?.status as keyof typeof statusColors] ||
                    "bg-muted text-muted-foreground"
                  }
                >
                  {trip?.status
                    ? trip.status.charAt(0).toUpperCase() + trip.status.slice(1)
                    : "Planning"}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground mt-1.5 font-sans-clean">
                {trip.origin && (
                  <>
                    <span>from {trip.origin}</span>
                    <span aria-hidden="true">·</span>
                  </>
                )}
                <span className="font-mono-data text-xs">
                  {trip.days} {Number(trip.days) === 1 ? "day" : "days"}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-data text-xs">
                  {getCurrencySymbol(trip.currency)}
                  {Number(trip.budget || 0).toLocaleString()}
                </span>
                <span aria-hidden="true">·</span>
                <span className="capitalize">
                  {String(trip.groupSize || "Solo").replace("-", " ")}
                  {/^\d+$/.test(String(trip.groupSize))
                    ? Number(trip.groupSize) === 1
                      ? " traveller"
                      : " travellers"
                    : ""}
                </span>
              </div>
            </div>
            <AnimatePresence>
              {isAtlasThinking && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center space-x-2 bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-full"
                >
                  <div className="flex space-x-1">
                    <motion.div
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.5, repeat: Infinity, delay: 0 }}
                      className="w-1.5 h-1.5 bg-[var(--customs-blue)] rounded-full"
                    />
                    <motion.div
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
                      className="w-1.5 h-1.5 bg-[var(--customs-blue)] rounded-full"
                    />
                    <motion.div
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.5, repeat: Infinity, delay: 0.4 }}
                      className="w-1.5 h-1.5 bg-[var(--customs-blue)] rounded-full"
                    />
                  </div>
                  <span className="text-xs font-medium text-[var(--customs-blue)]">
                    Atlas is thinking...
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="flex items-center gap-2 self-start flex-wrap">
              {!isEditing && (
                <div className="flex flex-wrap items-center gap-2">
                  {id && trip && (
                    <div className="flex items-center space-x-4">
                      <PresenceBubbles tripId={id} />
                      <CollaboratorManager tripId={id} ownerId={trip.userId} />
                    </div>
                  )}
                  {/* Edit + Delete kept in their own flex group (mirrors the
                      PresenceBubbles/CollaboratorManager grouping above) so at
                      narrow widths they wrap together as a pair instead of
                      Delete orphaning alone onto its own line, which read as
                      an oversized, disconnected red circle at 375px. */}
                  {isOwner && (
                    <Button
                      onClick={() => setShareDialogOpen(true)}
                      variant="outline"
                      size="sm"
                      className="border-border text-foreground hover:border-[var(--ink-blue)] hover:text-[var(--ink-blue)] no-print"
                      data-testid="button-share-trip"
                    >
                      <i className="fas fa-share-nodes md:mr-2"></i>
                      <span className="hidden md:inline">Share</span>
                    </Button>
                  )}
                  {/* Print itinerary — UX-audit finding: window.print()
                      already exists for the packing list and the
                      pre-save AI plan preview, but not for the itinerary
                      a traveler actually saved and travels with. Same
                      pattern as packing/index.tsx's print CSS below. */}
                  {activeMainTab === "itinerary" && (
                    <Button
                      onClick={() => window.print()}
                      variant="outline"
                      size="sm"
                      className="border-border text-foreground hover:border-[var(--ink-blue)] hover:text-[var(--ink-blue)] no-print"
                      data-testid="button-print-itinerary"
                    >
                      <i className="fas fa-print md:mr-2"></i>
                      <span className="hidden md:inline">Print</span>
                    </Button>
                  )}
                  {/* Edit is owner+editor; Delete is owner-only (matches
                      the server: deleteTrip scopes to { _id, userId }). A
                      viewer previously saw both buttons and just got a
                      rejected request on click (UX-audit finding). */}
                  {(canEditTrip || isOwner) && (
                    <div className="flex items-center gap-2">
                      {canEditTrip && (
                        <Button
                          onClick={() => setIsEditing(true)}
                          variant="outline"
                          size="sm"
                          className="border-border text-foreground hover:border-[var(--ink-blue)] hover:text-[var(--ink-blue)] "
                          data-testid="button-edit-trip"
                        >
                          <i className="fas fa-edit md:mr-2"></i>
                          <span className="hidden md:inline">Edit</span>
                        </Button>
                      )}
                      {isOwner && (
                        <Button
                          onClick={() => setDeleteConfirmOpen(true)}
                          variant="outline"
                          size="sm"
                          className="bg-muted/50 border-[var(--stamp-red)] text-[var(--stamp-red)] hover:bg-[var(--stamp-red-deep)] hover:text-white "
                          data-testid="button-delete-trip"
                        >
                          <i className="fas fa-trash md:mr-2"></i>
                          <span className="hidden md:inline">Delete</span>
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Hero Image */}
          <div className="relative rounded-xl overflow-hidden w-full aspect-video md:aspect-auto md:h-80 bg-muted/50 flex items-center justify-center group">
            {trip.imageUrl && !heroImgError ? (
              <>
                <img
                  src={trip.imageUrl}
                  alt={trip.destination}
                  onError={() => setHeroImgError(true)}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent"></div>

                {(trip as any).imageCaption && (
                  <div className="absolute bottom-4 left-4 z-10">
                    <div className="bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-2">
                      <i className="fas fa-camera text-[var(--customs-blue)] text-xs"></i>
                      <span className="text-white text-xs font-medium tracking-wide drop-shadow-sm">
                        {(trip as any).imageCaption}
                      </span>
                    </div>
                  </div>
                )}

                {/* Image refresh button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-4 right-4 z-20 text-white/70 hover:text-white bg-black/40 hover:bg-black/60 backdrop-blur-md transition-all rounded-full border border-white/10"
                  onClick={async (e) => {
                    e.stopPropagation();
                    toast({
                      title: "Refreshing image...",
                      description: "Looking for a better photo.",
                    });
                    try {
                      const res = await apiRequest("POST", `/api/v1/trips/${id}/image?force=true`);
                      const data = await res.json();
                      if (data?.imageUrl && trip) {
                        setCurrentTrip({
                          ...trip,
                          imageUrl: data.imageUrl,
                          imageCaption: data.imageCaption,
                        });
                      }
                      if (data?.imageChanged) {
                        toast({ title: "Image updated!", description: "Found a new photo." });
                      } else {
                        toast({
                          title: "No new photo found",
                          description: "That's the best match we could find for this destination.",
                          variant: "destructive",
                        });
                      }
                    } catch (err) {
                      toast({ title: "Failed to refresh", variant: "destructive" });
                    }
                  }}
                  title="Refresh Image"
                >
                  <i className="fas fa-sync-alt hover:animate-spin"></i>
                </Button>
              </>
            ) : (
              <div className="absolute inset-0 hero-fallback-ink transition-opacity"></div>
            )}

            {/* Text overlay removed to prevent duplication with the main header */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent"></div>
          </div>
        </div>

        {/* Edit Form */}
        {isEditing && (
          <Card className="bg-card border-border mb-8">
            <CardHeader>
              <CardTitle className="text-xl font-bold text-foreground">Edit Trip Details</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-6" data-testid="trip-edit-form">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">
                      Starting Location
                    </label>
                    <Input
                      type="text"
                      value={tripForm.origin}
                      onChange={(e) => setTripForm((prev) => ({ ...prev, origin: e.target.value }))}
                      className="bg-muted/50 border text-foreground"
                      placeholder="Where are you traveling from?"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">
                      Destination <span className="text-[var(--stamp-red)]">*</span>
                    </label>
                    <Input
                      type="text"
                      value={tripForm.destination}
                      onChange={(e) =>
                        setTripForm((prev) => ({ ...prev, destination: e.target.value }))
                      }
                      className="bg-muted/50 border text-foreground"
                      data-testid="input-edit-destination"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">
                      Budget (INR)
                    </label>
                    <Input
                      type="number"
                      value={tripForm.budget}
                      onChange={(e) => setTripForm((prev) => ({ ...prev, budget: e.target.value }))}
                      className="bg-muted/50 border text-foreground"
                      data-testid="input-edit-budget"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="edit-start-date"
                        className="block text-sm font-semibold text-foreground mb-2"
                      >
                        Start date
                      </label>
                      <Input
                        id="edit-start-date"
                        type="date"
                        value={tripForm.startDate}
                        onChange={(e) =>
                          setTripForm((prev) => ({ ...prev, startDate: e.target.value }))
                        }
                        className="bg-muted/50 border text-foreground"
                        data-testid="input-edit-start-date"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="edit-end-date"
                        className="block text-sm font-semibold text-foreground mb-2"
                      >
                        End date
                      </label>
                      <Input
                        id="edit-end-date"
                        type="date"
                        min={tripForm.startDate || undefined}
                        value={tripForm.endDate}
                        onChange={(e) =>
                          setTripForm((prev) => ({ ...prev, endDate: e.target.value }))
                        }
                        className="bg-muted/50 border text-foreground"
                        data-testid="input-edit-end-date"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">
                      Trip Duration <span className="text-[var(--stamp-red)]">*</span>
                    </label>
                    <div className="relative">
                      <Input
                        type="number"
                        min="1"
                        value={tripForm.days}
                        onChange={(e) => setTripForm((prev) => ({ ...prev, days: e.target.value }))}
                        className="bg-muted/50 border text-foreground pr-12"
                        data-testid="input-edit-duration"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        {Number(tripForm.days) === 1 ? "day" : "days"}
                      </span>
                    </div>
                    {/* Live-reported: reducing Trip Duration here doesn't
                        touch the itinerary at all — this form's own
                        endpoint (PUT /trips/:id) deliberately never writes
                        `itinerary` (only the dedicated /itinerary/* routes
                        do, each with its own concurrency protection), so a
                        planned Day 8 activity is never silently deleted
                        just because someone shortened the trip. That's the
                        right call for real data, but with no explanation
                        it looks broken — this makes the mismatch visible
                        and points at the one place it can actually be
                        fixed, instead of leaving it a silent surprise. */}
                    {Array.isArray(trip.itinerary) &&
                      trip.itinerary.length > 0 &&
                      Number(tripForm.days) < trip.itinerary.length && (
                        <p className="text-xs text-[var(--ink-blue)] mt-1.5">
                          Your itinerary still has {trip.itinerary.length}{" "}
                          {trip.itinerary.length === 1 ? "day" : "days"} planned — reducing this
                          number won't remove them. Trim the extra days from the Itinerary tab if
                          you want them gone.
                        </p>
                      )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">
                      Status
                    </label>
                    <Select
                      value={tripForm.status}
                      onValueChange={(value: "planning" | "active" | "completed") =>
                        setTripForm((prev) => ({ ...prev, status: value }))
                      }
                    >
                      <SelectTrigger
                        className="bg-muted/50 border text-foreground"
                        data-testid="select-edit-status"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-muted/50 border">
                        <SelectItem value="planning" className="text-foreground hover:bg-card">
                          Planning
                        </SelectItem>
                        <SelectItem value="active" className="text-foreground hover:bg-card">
                          Active
                        </SelectItem>
                        <SelectItem value="completed" className="text-foreground hover:bg-card">
                          Completed
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">Notes</label>
                  <Textarea
                    value={tripForm.notes}
                    onChange={(e) => setTripForm((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder="Add any notes about your trip..."
                    className="bg-muted/50 border text-foreground placeholder:text-muted-foreground min-h-[100px]"
                    data-testid="textarea-edit-notes"
                  />
                </div>

                <div className="flex space-x-4">
                  <Button
                    type="button"
                    onClick={handleCancel}
                    variant="outline"
                    className="flex-1 bg-muted/50 border text-foreground hover:bg-card "
                    data-testid="button-cancel-edit"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSave}
                    disabled={updateTripMutation.isPending}
                    className="flex-1 bg-[var(--customs-blue)] hover:bg-[var(--amber)]"
                    data-testid="button-save-trip"
                  >
                    {updateTripMutation.isPending ? (
                      <>
                        <i className="fas fa-spinner fa-spin mr-2"></i>
                        Saving...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-save mr-2"></i>
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Trip Content — Tabbed */}
        <Tabs value={activeMainTab} onValueChange={setActiveMainTab} className="space-y-0">
          <TabsList
            // justify-start overrides TabsList's base justify-center: when the
            // triggers overflow this strip at ~375px, centering pushes the first
            // tab past the left edge where scrolling can never reach it
            // (scrollLeft is already 0) — live-measured as the active tab
            // rendering as "iew".
            className="flex w-full justify-start bg-muted/50 rounded-xl mb-6 p-1 h-auto gap-0.5 overflow-x-auto"
          >
            <TabsTrigger
              value="overview"
              className="flex-shrink-0 sm:flex-1 whitespace-nowrap rounded-lg text-xs font-semibold px-3 sm:px-1 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm py-2"
            >
              <i className="fas fa-compass mr-1 sm:mr-1.5" />
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="itinerary"
              className="flex-shrink-0 sm:flex-1 whitespace-nowrap rounded-lg text-xs font-semibold px-3 sm:px-1 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm py-2"
            >
              <i className="fas fa-route mr-1 sm:mr-1.5" />
              Itinerary
            </TabsTrigger>
            <TabsTrigger
              value="map"
              className="flex-shrink-0 sm:flex-1 whitespace-nowrap rounded-lg text-xs font-semibold px-3 sm:px-1 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm py-2"
            >
              <i className="fas fa-map-marked-alt mr-1 sm:mr-1.5" />
              Map
            </TabsTrigger>
            <TabsTrigger
              value="budget"
              className="flex-shrink-0 sm:flex-1 whitespace-nowrap rounded-lg text-xs font-semibold px-3 sm:px-1 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm py-2"
            >
              <i className="fas fa-wallet mr-1 sm:mr-1.5" />
              Budget
            </TabsTrigger>
            <TabsTrigger
              value="places"
              className="flex-shrink-0 sm:flex-1 whitespace-nowrap rounded-lg text-xs font-semibold px-3 sm:px-1 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm py-2"
            >
              <i className="fas fa-search-location mr-1 sm:mr-1.5" />
              Places
            </TabsTrigger>
          </TabsList>

          {/* ── Overview tab ─────────────────────────────────── */}
          <TabsContent value="overview" className="space-y-6 mt-0">
            {/* "Today" panel — UX-audit finding: a completed trip's detail
                page was byte-for-byte identical to an active one, no
                day-of-travel view at all. Scoped down from a full
                separate view to a lightweight card here: only renders
                for an active trip with dated days, finds today's day by
                date match, and surfaces "next up" by comparing activity
                times against the current clock. Real feature work (a
                dedicated live-tracking view) is still a bigger ask than
                this — flagged as such, not claiming full parity. */}
            {trip.status === "active" &&
              Array.isArray(trip.itinerary) &&
              (() => {
                const todayStr = new Date().toDateString();
                const todayDay = trip.itinerary.find(
                  (d) => d.date && new Date(d.date).toDateString() === todayStr,
                );
                if (!todayDay) return null;
                const now = new Date();
                const nowMinutes = now.getHours() * 60 + now.getMinutes();
                const toMinutes = (t?: string) => {
                  if (!t) return null;
                  const m = /^(\d{1,2}):(\d{2})/.exec(t);
                  if (!m) return null;
                  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
                };
                const upcoming = todayDay.activities
                  .map((a) => ({ a, mins: toMinutes(a.time) }))
                  .filter((x) => x.mins != null && x.mins >= nowMinutes)
                  .sort((x, y) => (x.mins as number) - (y.mins as number));
                const nextUp = upcoming[0]?.a;
                return (
                  <Card className="bg-card border-[rgb(var(--transit-green-rgb)/40%)] border-2">
                    <CardHeader>
                      <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                        <span className="stamp text-[10px] text-[var(--forest)]">Today</span>
                        Day {todayDay.day ?? todayDay.dayIndex + 1}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {nextUp ? (
                        <div className="bg-muted/50 rounded-xl p-4">
                          <p className="label-xs text-muted-foreground mb-1">Next up</p>
                          <p className="font-bold text-foreground">
                            {nextUp.time && (
                              <span className="font-mono-data mr-2">{nextUp.time}</span>
                            )}
                            {nextUp.title || nextUp.placeName}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No more scheduled activities today.
                        </p>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {todayDay.activities.length}{" "}
                        {todayDay.activities.length === 1 ? "activity" : "activities"} planned today
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}

            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-xl font-bold text-foreground">Trip Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-muted/50 rounded-xl">
                    <i className="fas fa-calendar text-[var(--customs-blue)] text-xl mb-2"></i>
                    <p className="text-sm text-muted-foreground">Duration</p>
                    <p className="font-bold text-foreground">{trip.days} days</p>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-xl">
                    <i className="fas fa-wallet text-[var(--transit-green)] text-xl mb-2"></i>
                    <p className="text-sm text-muted-foreground">Budget</p>
                    <p className="font-bold text-foreground">
                      {getCurrencySymbol(trip.currency)}
                      {Number(trip.budget || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-xl">
                    <i className="fas fa-users text-amber-500 text-xl mb-2"></i>
                    <p className="text-sm text-muted-foreground">Group</p>
                    <p className="font-bold text-foreground capitalize">
                      {String(trip.groupSize).replace("-", " ")}
                    </p>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-xl">
                    {selectedStyle && (
                      <selectedStyle.icon
                        className={`${selectedStyle.color} w-6 h-6 mb-2 mx-auto`}
                      />
                    )}
                    <p className="text-sm text-muted-foreground">Style</p>
                    <p className="font-bold text-foreground capitalize">
                      {(trip.travelStyle || "standard").replace("-", " ")}
                    </p>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-xl">
                    {weather?.current ? (
                      <>
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <i
                            className={`${weather.current.icon || getWeatherIcon(weather.current.condition)} text-2xl`}
                          ></i>
                        </div>
                        <p className="text-sm text-muted-foreground">{weather.current.condition}</p>
                        <p className="font-bold text-foreground">
                          {Math.round(weather.current.temperature)}°C
                        </p>
                      </>
                    ) : weatherLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[var(--customs-blue)] mx-auto mb-2"></div>
                        <p className="text-sm text-muted-foreground">Weather</p>
                        <p className="font-bold text-foreground text-xs">Loading...</p>
                      </>
                    ) : (
                      <>
                        <i className="fas fa-exclamation-circle text-muted-foreground text-xl mb-2"></i>
                        <p className="text-sm text-muted-foreground">Weather</p>
                        <p className="font-bold text-muted-foreground text-xs">Unavailable</p>
                      </>
                    )}
                  </div>
                  {trip.transportMode && (
                    <div className="text-center p-4 bg-muted/50 rounded-xl">
                      <i
                        className={`${trip.transportMode === "flight" ? "fas fa-plane" : trip.transportMode === "train" ? "fas fa-train" : trip.transportMode === "bus" ? "fas fa-bus" : trip.transportMode === "car" ? "fas fa-car-side" : "fas fa-ship"} text-[var(--customs-blue)] text-xl mb-2`}
                      ></i>
                      <p className="text-sm text-muted-foreground">Transport</p>
                      <p className="font-bold text-foreground capitalize">{trip.transportMode}</p>
                    </div>
                  )}
                </div>

                {tripForm.notes && (
                  <div className="mt-6">
                    <h4 className="font-semibold text-foreground mb-2">Notes</h4>
                    <p className="text-muted-foreground bg-muted/50 rounded-xl p-4">
                      {tripForm.notes}
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setContext({ currentTripId: id, currentPage: "trip-detail" });
                    if (!isChatOpen) toggleChat();
                    void sendMessage(
                      `Generate a packing list for my trip to ${trip.destination} and save it to this trip. ` +
                        `Check the destination's weather for the trip dates first and tailor the list to it ` +
                        `(rain gear, warm layers, sun protection as appropriate).`,
                    );
                    // Land on the packing page with this trip pre-selected so
                    // the list Atlas saves shows up where the user works on it.
                    setLocation(`/app/packing?tripId=${id}`);
                  }}
                  className="mt-6 w-full text-left flex items-center justify-between p-4 bg-muted/50 hover:bg-muted rounded-xl cursor-pointer transition-colors group"
                  aria-label="Have Atlas build a weather-aware packing list for this trip"
                >
                  <div className="flex items-center gap-3">
                    <i className="fas fa-suitcase-rolling text-[var(--customs-blue)] text-lg"></i>
                    <div>
                      <p className="font-semibold text-foreground">Smart packing list</p>
                      <p className="text-xs text-muted-foreground">
                        Atlas suggests items based on the destination's weather
                      </p>
                    </div>
                  </div>
                  <i className="fas fa-chevron-right text-muted-foreground group-hover:text-foreground transition-colors"></i>
                </button>
              </CardContent>
            </Card>

            {/* Travel Smart Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Travel Hacks */}
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-xl font-bold text-foreground flex items-center gap-2">
                    <i className="fas fa-lightbulb text-amber-500"></i>
                    Travel Hacks & Savvy Tips
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {hacks?.hacks?.map((hack: string, i: number) => (
                      <div key={i} className="flex gap-3 text-sm text-muted-foreground">
                        <div className="text-amber-500 pt-1">•</div>
                        <div>{hack}</div>
                      </div>
                    ))}
                    {(!hacks || hacks.hacks?.length === 0) && (
                      <p className="text-muted-foreground italic text-sm">Fetching smart tips...</p>
                    )}
                  </div>
                  {hacks?.economicalAlternatives?.length > 0 && (
                    <div className="mt-6">
                      <h4 className="text-sm font-bold text-foreground mb-3">
                        Economical Alternatives
                      </h4>
                      <div className="space-y-2">
                        {hacks.economicalAlternatives.map((alt: string, i: number) => (
                          <div
                            key={i}
                            className="bg-[rgb(var(--transit-green-rgb)/10%)] border border-[rgb(var(--transit-green-rgb)/20%)] rounded-xl p-3 text-xs text-[var(--transit-green)]"
                          >
                            <i className="fas fa-wallet mr-2"></i>
                            {alt}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Quiet Alternatives */}
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-xl font-bold text-foreground flex items-center gap-2">
                    <i className="fas fa-leaf text-[var(--transit-green)]"></i>
                    Escape the Crowds
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {quietPlaces?.spots?.map((spot: any, i: number) => (
                      <div key={i} className="border-b border-border pb-4 last:border-0 last:pb-0">
                        <div className="font-bold text-foreground text-sm mb-1">{spot.name}</div>
                        <div className="text-xs text-muted-foreground mb-2">{spot.address}</div>

                        <div className="flex flex-wrap gap-2 mb-2">
                          {spot.crowdLevel && (
                            <Badge
                              variant="outline"
                              className="text-xs bg-[rgb(var(--transit-green-rgb)/15%)] text-[var(--transit-green)] border-[rgb(var(--transit-green-rgb)/40%)]"
                            >
                              <i className="fas fa-users-slash mr-1"></i> {spot.crowdLevel} Crowds
                            </Badge>
                          )}
                          {spot.type && (
                            <Badge
                              variant="outline"
                              className="text-xs bg-[rgb(var(--customs-blue-rgb)/15%)] text-[var(--customs-blue)] border-[rgb(var(--customs-blue-rgb)/40%)]"
                            >
                              {spot.type}
                            </Badge>
                          )}
                          {spot.bestTime && (
                            <Badge
                              variant="outline"
                              className="text-xs bg-[rgb(var(--warning-amber-rgb)/15%)] text-[var(--warning-amber)] border-[rgb(var(--warning-amber-rgb)/40%)]"
                            >
                              <i className="fas fa-clock mr-1"></i> {spot.bestTime}
                            </Badge>
                          )}
                        </div>

                        <div className="text-xs text-[var(--customs-blue)] bg-[rgb(var(--customs-blue-rgb)/10%)] border border-[rgb(var(--customs-blue-rgb)/20%)] p-2 rounded-lg">
                          <i className="fas fa-info-circle mr-2"></i>
                          {spot.reason}
                        </div>
                      </div>
                    ))}
                    {(!quietPlaces?.spots || quietPlaces.spots.length === 0) && (
                      <p className="text-muted-foreground italic text-sm">
                        {quietLoading
                          ? "Discovery in progress..."
                          : "No quiet spots found for this area."}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Itinerary tab ─────────────────────────────────── */}
          <TabsContent value="itinerary" className="mt-0">
            <ItineraryManager
              trip={trip}
              onViewOnMap={handleViewOnMap}
              highlightActivityId={highlightActivityId}
              highlightNonce={highlightNonce}
              onViewInPlaces={handleViewInPlaces}
            />
          </TabsContent>

          {/* ── Map tab ─────────────────────────────────── */}
          <TabsContent value="map" className="mt-0">
            <TripMap
              destination={trip.destination}
              itinerary={Array.isArray(trip.itinerary) ? trip.itinerary : []}
              origin={trip.origin}
              onAddActivity={handleMapAddActivity}
              onDeleteActivity={handleMapDeleteActivity}
              onViewInItinerary={handleViewInItinerary}
              focusTarget={mapFocusTarget}
              tripStatus={trip.status}
            />
          </TabsContent>

          {/* ── Budget tab ─────────────────────────────────── */}
          <TabsContent value="budget" className="mt-0">
            <BudgetTracker trip={trip} />
          </TabsContent>

          {/* ── Places tab ─────────────────────────────────── */}
          <TabsContent value="places" className="mt-0">
            <div id="suggested-places-section" className="space-y-6">
              <div className="flex flex-col items-center gap-4">
                <h3 className="text-foreground font-semibold text-lg flex items-center gap-2">
                  <i className="fas fa-map-marked-alt text-[var(--customs-blue)]"></i>
                  What are you looking for at your destination?
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-lg mx-auto">
                  <Button
                    onClick={() => {
                      setShowHotels(!showHotels);
                      setPlacesTarget(null);
                    }}
                    variant={showHotels ? "default" : "outline"}
                    className={` h-12 ${showHotels ? "bg-[var(--customs-blue)] text-white hover:bg-[rgb(var(--customs-blue-rgb)/90%)]" : "bg-muted/50 border text-muted-foreground hover:text-foreground"}`}
                  >
                    <i className="fas fa-bed mr-2"></i>
                    Hotels
                  </Button>
                  <Button
                    onClick={() => {
                      setShowRestaurants(!showRestaurants);
                      setPlacesTarget(null);
                    }}
                    variant={showRestaurants ? "default" : "outline"}
                    className={` h-12 ${showRestaurants ? "bg-emerald-500 text-white hover:bg-emerald-500/90" : "bg-muted/50 border text-muted-foreground hover:text-foreground"}`}
                  >
                    <i className="fas fa-utensils mr-2"></i>
                    Restaurants
                  </Button>
                  <Button
                    onClick={() => setShowSpots(!showSpots)}
                    variant={showSpots ? "default" : "outline"}
                    className={` h-12 ${showSpots ? "bg-[var(--customs-blue)] text-white hover:bg-[var(--amber)]" : "bg-muted/50 border text-muted-foreground hover:text-foreground"}`}
                  >
                    <i className="fas fa-camera mr-2"></i>
                    Tourist Spots
                  </Button>
                </div>
              </div>

              {(showHotels || showRestaurants || showSpots) && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <Card className="bg-card border-border">
                    <CardHeader>
                      <CardTitle className="text-foreground text-base">Suggested Places</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {(hotelsLoading || foodLoading || sightsLoading) &&
                      !(hotelResults || foodResults || sightsResults) ? (
                        <div className="flex justify-center py-8">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--customs-blue)]"></div>
                        </div>
                      ) : (
                        <div
                          className={`grid gap-6 ${
                            [showHotels, showRestaurants, showSpots].filter(Boolean).length === 1
                              ? "grid-cols-1"
                              : [showHotels, showRestaurants, showSpots].filter(Boolean).length ===
                                  2
                                ? "grid-cols-1 sm:grid-cols-2"
                                : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                          }`}
                        >
                          {/* Hotels */}
                          {showHotels && (
                            <div>
                              <div className="flex items-center gap-2 mb-3 text-foreground font-semibold border-b border pb-2">
                                <i className="fas fa-bed text-[var(--customs-blue)]"></i> Hotels
                              </div>
                              {placesTarget?.category === "hotels" && (
                                <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
                                  Showing results for "{placesTarget.name}"
                                  <button
                                    type="button"
                                    onClick={() => setPlacesTarget(null)}
                                    className="text-[var(--explorer-blue)] hover:underline"
                                  >
                                    Show all hotels
                                  </button>
                                </div>
                              )}
                              <div className="space-y-3">
                                {hotelsLoading ? (
                                  <div className="text-muted-foreground text-xs">
                                    Loading hotels...
                                  </div>
                                ) : (
                                  <>
                                    {(hotelResults || []).slice(0, 5).map((i: any) => {
                                      const placeName = String(
                                        i.name || i.title || i.name_en || i.name_local || "",
                                      );
                                      const isTarget =
                                        placesTarget?.category === "hotels" &&
                                        placeName &&
                                        placesTarget.name
                                          .toLowerCase()
                                          .includes(placeName.toLowerCase());
                                      return (
                                        <div
                                          key={`h-${i.id}`}
                                          className={`text-sm text-foreground bg-muted/50 rounded-xl p-3 hover:bg-muted/50 transition-colors ${isTarget ? "ring-2 ring-[var(--explorer-blue)]" : ""}`}
                                        >
                                          <div className="font-semibold">
                                            {String(
                                              i.name ||
                                                i.title ||
                                                i.name_en ||
                                                i.name_local ||
                                                i.display_name?.split(",")[0] ||
                                                "Unknown Place",
                                            )}
                                          </div>
                                          <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                            {String(
                                              i.address ||
                                                (i.display_name?.includes(",")
                                                  ? i.display_name
                                                      .split(",")
                                                      .slice(1)
                                                      .join(",")
                                                      .trim()
                                                  : i.display_name) ||
                                                "",
                                            )}
                                          </div>
                                          {renderPlaceActions(i, "accommodation")}
                                        </div>
                                      );
                                    })}
                                    {hotelsError ? (
                                      <div className="text-xs">
                                        <p className="text-[var(--ios-red)]">
                                          Couldn't load hotels — the search failed, not that there
                                          aren't any.
                                        </p>
                                        <button
                                          type="button"
                                          onClick={() => refetchHotels()}
                                          className="text-[var(--explorer-blue)] hover:underline mt-1"
                                        >
                                          Try again
                                        </button>
                                      </div>
                                    ) : (
                                      (!hotelResults || hotelResults.length === 0) && (
                                        <div className="text-muted-foreground text-xs italic">
                                          No hotels found
                                        </div>
                                      )
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Restaurants */}
                          {showRestaurants && (
                            <div>
                              <div className="flex items-center gap-2 mb-3 text-foreground font-semibold border-b border pb-2">
                                <i className="fas fa-utensils text-emerald-500"></i> Restaurants
                              </div>
                              {placesTarget?.category === "food" && (
                                <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
                                  Showing results for "{placesTarget.name}"
                                  <button
                                    type="button"
                                    onClick={() => setPlacesTarget(null)}
                                    className="text-[var(--explorer-blue)] hover:underline"
                                  >
                                    Show all restaurants
                                  </button>
                                </div>
                              )}
                              <div className="space-y-3">
                                {foodLoading ? (
                                  <div className="text-muted-foreground text-xs">
                                    Loading restaurants...
                                  </div>
                                ) : (
                                  <>
                                    {(foodResults || []).slice(0, 5).map((i: any) => {
                                      const placeName = String(
                                        i.name || i.title || i.name_en || i.name_local || "",
                                      );
                                      const isTarget =
                                        placesTarget?.category === "food" &&
                                        placeName &&
                                        placesTarget.name
                                          .toLowerCase()
                                          .includes(placeName.toLowerCase());
                                      return (
                                        <div
                                          key={`f-${i.id}`}
                                          className={`text-sm text-foreground bg-muted/50 rounded-xl p-3 hover:bg-muted/50 transition-colors ${isTarget ? "ring-2 ring-[var(--explorer-blue)]" : ""}`}
                                        >
                                          <div className="font-semibold">
                                            {String(
                                              i.name ||
                                                i.title ||
                                                i.name_en ||
                                                i.name_local ||
                                                i.display_name?.split(",")[0] ||
                                                "Unknown Place",
                                            )}
                                          </div>
                                          <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                            {String(
                                              i.address ||
                                                (i.display_name?.includes(",")
                                                  ? i.display_name
                                                      .split(",")
                                                      .slice(1)
                                                      .join(",")
                                                      .trim()
                                                  : i.display_name) ||
                                                "",
                                            )}
                                          </div>
                                          {renderPlaceActions(i, "food")}
                                        </div>
                                      );
                                    })}
                                    {foodError ? (
                                      <div className="text-xs">
                                        <p className="text-[var(--ios-red)]">
                                          Couldn't load restaurants — the search failed, not that
                                          there aren't any.
                                        </p>
                                        <button
                                          type="button"
                                          onClick={() => refetchFood()}
                                          className="text-[var(--explorer-blue)] hover:underline mt-1"
                                        >
                                          Try again
                                        </button>
                                      </div>
                                    ) : (
                                      (!foodResults || foodResults.length === 0) && (
                                        <div className="text-muted-foreground text-xs italic">
                                          No restaurants found
                                        </div>
                                      )
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Tourist Spots */}
                          {showSpots && (
                            <div>
                              <div className="flex items-center gap-2 mb-3 text-foreground font-semibold border-b border pb-2">
                                <i className="fas fa-camera text-amber-500"></i> Tourist Spots
                              </div>
                              <div className="space-y-3">
                                {sightsLoading ? (
                                  <div className="text-muted-foreground text-xs">
                                    Loading spots...
                                  </div>
                                ) : (
                                  <>
                                    {(sightsResults || []).slice(0, 5).map((i: any) => (
                                      <div
                                        key={`s-${i.id}`}
                                        className="text-sm text-foreground bg-muted/50 rounded-xl p-3 hover:bg-muted/50 transition-colors"
                                      >
                                        <div className="font-semibold">
                                          {String(
                                            i.name ||
                                              i.title ||
                                              i.name_en ||
                                              i.name_local ||
                                              i.display_name?.split(",")[0] ||
                                              "Unknown Place",
                                          )}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                          {String(
                                            i.address ||
                                              (i.display_name?.includes(",")
                                                ? i.display_name
                                                    .split(",")
                                                    .slice(1)
                                                    .join(",")
                                                    .trim()
                                                : i.display_name) ||
                                              "",
                                          )}
                                        </div>
                                        {renderPlaceActions(i, "sightseeing")}
                                      </div>
                                    ))}
                                    {sightsError ? (
                                      <div className="text-xs">
                                        <p className="text-[var(--ios-red)]">
                                          Couldn't load spots — the search failed, not that there
                                          aren't any.
                                        </p>
                                        <button
                                          type="button"
                                          onClick={() => refetchSights()}
                                          className="text-[var(--explorer-blue)] hover:underline mt-1"
                                        >
                                          Try again
                                        </button>
                                      </div>
                                    ) : (
                                      (!sightsResults || sightsResults.length === 0) && (
                                        <div className="text-muted-foreground text-xs italic">
                                          No spots found
                                        </div>
                                      )
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Journal Entries — always shown below tabs */}
        {tripJournalEntries.length > 0 && (
          <Card className="bg-card border-border mt-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-bold text-foreground">Trip Journal</CardTitle>
                <div className="flex items-center gap-2">
                  <RecapPanel
                    tripId={id!}
                    destination={trip.destination}
                    entryCount={tripJournalEntries.length}
                    onRecapSaved={() =>
                      queryClient.invalidateQueries({ queryKey: ["/api/v1/journal"] })
                    }
                    recapJournalEntry={tripJournalEntries.find((e) => e.isRecap === true)}
                  />
                  <Link href="/app/journal">
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-muted/50 border text-foreground hover:bg-card"
                    >
                      View All
                    </Button>
                  </Link>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {tripJournalEntries.slice(0, 3).map((entry) => (
                  <div key={entry.id} className="bg-muted/50 rounded-xl p-4">
                    <h4 className="font-bold text-foreground mb-2">{entry.title}</h4>
                    <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                      {entry.content}
                    </p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{entry.location}</span>
                      <span>{new Date(entry.createdAt!).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this trip?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes "{trip.destination}" and its itinerary, budget, and packing
              data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteTripMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteTripMutation.isPending ? "Deleting..." : "Delete Trip"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share this trip</DialogTitle>
            <DialogDescription>
              Anyone with the link can view a read-only copy of your itinerary — no account needed,
              no edit access.
            </DialogDescription>
          </DialogHeader>
          {trip?.isPublic && trip?.shareId ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={`${window.location.origin}/share/${trip.shareId}`}
                  className="bg-muted border text-foreground font-mono-data text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(
                      `${window.location.origin}/share/${trip.shareId}`,
                    );
                    setLinkCopied(true);
                    setTimeout(() => setLinkCopied(false), 2000);
                  }}
                  aria-label="Copy link"
                >
                  {linkCopied ? (
                    <Check className="h-4 w-4 text-[var(--transit-green)]" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleShare(false)}
                disabled={shareLoading}
                className="text-[var(--stamp-red)] border-[rgb(var(--stamp-red-rgb)/50%)] hover:bg-[rgb(var(--stamp-red-rgb)/10%)]"
              >
                {shareLoading ? "Working…" : "Stop sharing"}
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => toggleShare(true)}
              disabled={shareLoading}
              className="bg-[var(--amber)] hover:bg-[var(--airbnb-primary-active)] text-white w-full"
            >
              {shareLoading ? "Creating link…" : "Create public link"}
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
