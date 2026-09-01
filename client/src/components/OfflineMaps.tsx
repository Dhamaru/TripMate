import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { NamePromptDialog } from "@/components/ui/NamePromptDialog";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/components/layout/ThemeProvider";
import { computeTileUrls, downloadTiles, deleteTiles, formatBytes } from "@/lib/offlineTiles";
import { apiRequest } from "@/lib/queryClient";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const REGION_RADIUS_DEG = 0.05; // ~5.5km — matches the padding used in openOfflineMap's bounds
const REGION_ZOOM_MIN = 12;
const REGION_ZOOM_MAX = 15;
const STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, matches the UI's "auto-expire" copy
// Faked dark mode over OSM's (light-only) tiles — standard invert-hue trick.
const DARK_TILE_FILTER = "invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9)";

interface MapRegion {
  id: string;
  name: string;
  country: string;
  bytes: number;
  tileUrls: string[];
  downloaded: boolean;
  downloading: boolean;
  progress: number;
  lat: number;
  lng: number;
  zoom: number;
  downloadedAt?: number;
}

interface PlaceResult {
  id: string;
  name: string;
  displayName: string;
  lat: number;
  lon: number;
  category?: string;
  type?: string;
  name_en?: string;
  name_local?: string;
  transliteration?: string;
  road?: string;
  city?: string;
  country?: string;
  postcode?: string;
  photoUrl?: string;
}

interface CustomPin {
  id: string;
  lat: number;
  lng: number;
  name: string;
  note?: string;
  color: string;
}

interface OfflineMapsProps {
  className?: string;
}

const STORAGE_KEY = "tripmate_offlinemaps_v2";
const PINS_STORAGE_KEY = "tripmate_custom_pins_v2"; // Sync versioning

const DEFAULT_REGIONS: MapRegion[] = [];

export function OfflineMaps({ className = "" }: OfflineMapsProps) {
  const [activeTab, setActiveTab] = useState<"explore" | "navigation" | "saved">("explore");
  // Focus-mode bottom sheet — collapsed shows a one-line peek (Storage Usage
  // summary + handle), expanded reveals Storage/Search/Saved Regions in full.
  // An overlay on top of the map rather than a flow sibling, so toggling it
  // never changes the map container's own size (no need to invalidateSize).
  const [sheetExpanded, setSheetExpanded] = useState(false);
  // The map initializes at a world view (zoom 2) while waiting on
  // geolocation to resolve (or its fallback to fire) — at that zoom level
  // OSM tiles are mostly featureless landmass fill, and the dark-mode
  // invert() filter turns that into what a real-user QA pass correctly
  // flagged as "unreadable black continents". It was never a permanent
  // state (geolocation resolves or times out within ~5s either way), but
  // showing it at all reads as broken. Cover it with a normal loading
  // state until the map actually has something worth looking at.
  const [mapReady, setMapReady] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRegion, setSelectedRegion] = useState<MapRegion | null>(null);
  const { theme } = useTheme();
  const resolvedTheme =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  const [darkMode, setDarkMode] = useState(resolvedTheme === "dark");
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pendingPinCenter, setPendingPinCenter] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const [offlineModeRegion, setOfflineModeRegion] = useState<MapRegion | null>(null);

  useEffect(() => {
    setDarkMode(resolvedTheme === "dark");
  }, [resolvedTheme]);

  useEffect(() => {
    if (theme !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setDarkMode(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [theme]);

  function openOfflineMap(region: MapRegion) {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Simulate restricting map to this region
    const bounds = L.latLngBounds(
      [region.lat - 0.05, region.lng - 0.05],
      [region.lat + 0.05, region.lng + 0.05],
    );

    map.setMaxBounds(bounds.pad(0.5)); // Allow a little padding buffer
    map.fitBounds(bounds);
    map.setMinZoom(11); // Don't allow zooming out too far

    setOfflineModeRegion(region);
    toast({
      title: `Opened ${region.name}`,
      description: "You are now viewing the offline map area.",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function exitOfflineMap() {
    const map = mapInstanceRef.current;
    if (!map) return;

    map.setMaxBounds([
      [-90, -180],
      [90, 180],
    ]); // Clear restriction (World bounds)
    map.setMinZoom(2);
    map.setView([20, 0], 2);
    setOfflineModeRegion(null);
    toast({ title: "Exited Offline View", description: "Showing world map." });
  }

  // Custom Pins State — backed by the server (userId-scoped) so pins sync
  // across devices/browsers instead of living only in this browser's
  // localStorage, which silently lost pins on clearing site data, a
  // private window, or switching devices.
  const [customPins, setCustomPins] = useState<CustomPin[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiRequest("GET", "/api/v1/map-pins");
        if (!res.ok) return;
        const serverPins: CustomPin[] = await res.json();

        if (serverPins.length === 0) {
          // One-time migration: a pre-existing localStorage-only user might
          // have real pins that predate this backend. Upload them once,
          // then stop reading from localStorage entirely.
          let localPins: CustomPin[] = [];
          try {
            const raw = localStorage.getItem(PINS_STORAGE_KEY);
            localPins = raw ? JSON.parse(raw) : [];
          } catch {
            /* ignore */
          }
          if (localPins.length > 0) {
            const migrated: CustomPin[] = [];
            for (const p of localPins) {
              try {
                const r = await apiRequest("POST", "/api/v1/map-pins", {
                  lat: p.lat,
                  lng: p.lng,
                  name: p.name,
                  note: p.note,
                  color: p.color,
                });
                if (r.ok) migrated.push(await r.json());
              } catch {
                /* skip pins that fail to migrate */
              }
            }
            setCustomPins(migrated);
            localStorage.removeItem(PINS_STORAGE_KEY);
            return;
          }
        }
        setCustomPins(serverPins);
      } catch {
        /* offline or request failed — leave pins empty for this session */
      }
    })();
  }, []);

  // Tile URLs belonging to regions that just aged past STALE_AFTER_MS on this
  // load — stashed here so a mount-time effect can actually evict them from
  // Cache Storage. Cache eviction is async and can't happen inside the
  // synchronous useState initializer below.
  const staleTileUrlsToPurgeRef = useRef<string[]>([]);

  const [mapRegions, setMapRegions] = useState<MapRegion[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Array<Partial<MapRegion> & { size?: string }>;
        const now = Date.now();
        return parsed.map((r) => {
          // Regions saved before real tile caching (or downloaded >30 days
          // ago) have no actual cached tiles — don't claim they're offline.
          const hasRealTiles = Array.isArray(r.tileUrls) && r.tileUrls.length > 0;
          const isStale = !r.downloadedAt || now - r.downloadedAt > STALE_AFTER_MS;
          const stillDownloaded = !!r.downloaded && hasRealTiles && !isStale;
          if (hasRealTiles && isStale) {
            staleTileUrlsToPurgeRef.current.push(...r.tileUrls!);
          }
          return {
            id: r.id!,
            name: r.name!,
            country: r.country || "Unknown",
            bytes: typeof r.bytes === "number" ? r.bytes : 0,
            tileUrls: stillDownloaded ? r.tileUrls! : [],
            downloaded: stillDownloaded,
            downloading: false,
            progress: stillDownloaded ? 100 : 0,
            lat: r.lat!,
            lng: r.lng!,
            zoom: r.zoom ?? 12,
            downloadedAt: stillDownloaded ? r.downloadedAt : undefined,
          };
        });
      }
    } catch {}
    return DEFAULT_REGIONS;
  });

  // Actually evict cache entries for regions that aged out on this load —
  // previously the UI marked them "not downloaded" but left the tiles in
  // Cache Storage forever, contradicting the "auto-expire" copy below.
  useEffect(() => {
    if (staleTileUrlsToPurgeRef.current.length > 0) {
      deleteTiles(staleTileUrlsToPurgeRef.current);
      staleTileUrlsToPurgeRef.current = [];
    }
  }, []);

  const [placesResults, setPlacesResults] = useState<PlaceResult[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<PlaceResult[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);

  // Navigation State
  const [isNavigating, setIsNavigating] = useState(false);
  const [currentHeading, setCurrentHeading] = useState<number>(0);
  const [routePoints, setRoutePoints] = useState<[number, number][]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<{
    lat: number;
    lon: number;
    name: string;
  } | null>(null);
  const [navDestInput, setNavDestInput] = useState("");
  const [navDestSuggestions, setNavDestSuggestions] = useState<
    Array<{ lat: number; lon: number; display_name: string }>
  >([]);
  const [navDestLoading, setNavDestLoading] = useState(false);
  const [showNavDestSuggestions, setShowNavDestSuggestions] = useState(false);
  const navDestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filters
  const [filters, setFilters] = useState({
    food: true,
    hotel: true,
    sights: true,
  });

  const suggestTimerRef = useRef<number | null>(null);
  const { toast } = useToast();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const routePolylineRef = useRef<L.Polyline | null>(null);
  const pinMarkersRef = useRef<L.Marker[]>([]);
  const placesAbortRef = useRef<AbortController | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // Persist regions & pins
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mapRegions));
    } catch {}
  }, [mapRegions]);

  useEffect(() => {
    refreshPinMarkers();
  }, [customPins]);

  // Clean up markers helper
  const clearPinMarkers = () => {
    pinMarkersRef.current.forEach((m) => m.remove());
    pinMarkersRef.current = [];
  };

  const refreshPinMarkers = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    clearPinMarkers();

    customPins.forEach((pin) => {
      const icon = L.divIcon({
        className: "custom-pin-icon",
        html: `<div style="background-color: ${pin.color}; width: 14px; height: 14px; border-radius: 50%; border: 3px solid white;"></div>`,
        iconSize: [20, 20],
      });

      // Build the popup as real DOM nodes with a bound listener instead of
      // an HTML string with an inline onclick= attribute — the CSP here has
      // no 'unsafe-inline' in script-src, so inline event handler attributes
      // are silently blocked by the browser. That made the Delete button
      // a no-op in production despite looking and rendering fine.
      const popupEl = document.createElement("div");
      const title = document.createElement("b");
      title.textContent = pin.name;
      popupEl.appendChild(title);
      if (pin.note) {
        popupEl.appendChild(document.createElement("br"));
        popupEl.appendChild(document.createTextNode(pin.note));
      }
      popupEl.appendChild(document.createElement("br"));
      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "Delete";
      deleteBtn.style.color = "red";
      deleteBtn.style.fontSize = "10px";
      deleteBtn.style.marginTop = "4px";
      deleteBtn.addEventListener("click", async () => {
        try {
          const r = await apiRequest("DELETE", `/api/v1/map-pins/${pin.id}`);
          if (!r.ok) throw new Error("delete_failed");
          setCustomPins((prev) => prev.filter((p) => p.id !== pin.id));
          toast({ title: "Pin Deleted" });
        } catch {
          toast({
            title: "Couldn't delete pin",
            description: "Try again.",
            variant: "destructive",
          });
        }
      });
      popupEl.appendChild(deleteBtn);

      const marker = L.marker([pin.lat, pin.lng], { icon }).addTo(map).bindPopup(popupEl);
      pinMarkersRef.current.push(marker);
    });
  };

  // Initialize Leaflet
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
      iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
      shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    });

    // Leaflet wraps the world horizontally by default — at low zoom on a
    // wide viewport (exactly the container/breakpoint this component runs
    // at) that renders as multiple repeated copies of the world map side
    // by side instead of one. maxBounds + noWrap on the tile layer confine
    // it to a single instance of the world.
    const worldBounds: L.LatLngBoundsExpression = [
      [-90, -180],
      [90, 180],
    ];
    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      maxBounds: worldBounds,
      maxBoundsViscosity: 1.0,
    }).setView([20, 0], 2);

    // CARTO's free basemap CDN now requires a registered API key (started
    // returning a watermarked "API KEY REQUIRED" placeholder tile instead of
    // real map data, live-confirmed). OpenStreetMap's own tile server needs
    // no key/signup; dark mode is faked with a CSS filter on the tile pane
    // instead of switching tile sets, so toggling doesn't reload tiles.
    const osmUrl = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

    const layer = L.tileLayer(osmUrl, {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
      noWrap: true,
    }).addTo(map);

    tileLayerRef.current = layer;
    const tilePane = map.getPane("tilePane");
    if (tilePane) tilePane.style.filter = darkMode ? DARK_TILE_FILTER : "";

    mapInstanceRef.current = map;

    // Map Click Listener for Custom Pins
    map.on("click", (e) => {
      // Accessing activeTab from ref would be better but for simplicity in this effect:
      // We rely on the button add approach or prompt if mode is enabled.
      // Actually checking a ref or global var is safer in closures.
      // For now, I'll add a separate "Add Pin" mode toggle or just check tab in a ref if I had one.
      // Simpler: Just rely on the UI button to add pin at center, or use a specific event if "Saved" tab is active.

      const isSavedTab = document.getElementById("tab-indicator-saved") !== null; // Hacky check if we don't have ref

      // Let's use a cleaner approach: user clicks "Add Pin" button, then clicks map.
      // Or just prompt on click if in 'saved' tab.
      // Since state `activeTab` isn't accessible in this closure easily without ref,
      // I will rely on a "Add Pin Current Location" button in the UI instead of click-map for stability.
    });

    // Initial state: Prioritize Geolocation
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          // Auto-locate: Just center the map, don't add a marker until requested
          map.setView([pos.coords.latitude, pos.coords.longitude], 13);
          setMapReady(true);
        },
        (err) => {
          console.error("Auto-locate failed, falling back to downloaded regions", err);
          // Fallback: Use downloaded region if available
          const downloadedRegion = mapRegions.find((r) => r.downloaded) ?? mapRegions[0];
          if (downloadedRegion) {
            map.setView([downloadedRegion.lat, downloadedRegion.lng], downloadedRegion.zoom);
          }
          setMapReady(true);
        },
        { enableHighAccuracy: true, timeout: 5000 },
      );
    } else {
      // No Geo support: specific fallback
      const downloadedRegion = mapRegions.find((r) => r.downloaded) ?? mapRegions[0];
      if (downloadedRegion) {
        map.setView([downloadedRegion.lat, downloadedRegion.lng], downloadedRegion.zoom);
      }
      setMapReady(true);
    }

    refreshPinMarkers();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle Dark Mode — invert the OSM tile pane via CSS instead of loading a
  // separate dark tile set (there isn't a no-key one anymore).
  useEffect(() => {
    const tilePane = mapInstanceRef.current?.getPane("tilePane");
    if (tilePane) tilePane.style.filter = darkMode ? DARK_TILE_FILTER : "";
  }, [darkMode]);

  // Live Navigation Logic
  useEffect(() => {
    if (isNavigating) {
      if (!navigator.geolocation) {
        toast({ title: "Error", description: "Geolocation not supported", variant: "destructive" });
        setIsNavigating(false);
        return;
      }

      toast({ title: "Navigation Started", description: "Tracking your movement..." });
      let hasWarnedThisSession = false;

      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, heading } = pos.coords;
          const map = mapInstanceRef.current;

          setUserLocation({ lat: latitude, lon: longitude });
          if (heading != null) setCurrentHeading(heading);

          if (map) {
            // Update User Marker
            if (userMarkerRef.current) userMarkerRef.current.remove();

            // Navigation Arrow Icon — #1D4E89 is the customs-blue design
            // token (DESIGN.md); hardcoded here because Leaflet divIcons
            // render outside the CSS/Tailwind pipeline, so it can't reference
            // the token directly. Keep in sync with DESIGN.md if that value
            // ever changes.
            const arrowHtml = `
              <div style="
                transform: rotate(${heading || 0}deg);
                transition: transform 0.3s ease;
                width: 0;
                height: 0;
                border-left: 10px solid transparent;
                border-right: 10px solid transparent;
                border-bottom: 20px solid #1D4E89;
              "></div>`;

            const navIcon = L.divIcon({
              className: "nav-arrow-icon",
              html: arrowHtml,
              iconSize: [20, 20],
              iconAnchor: [10, 10],
            });

            userMarkerRef.current = L.marker([latitude, longitude], { icon: navIcon }).addTo(map);

            // Auto Follow
            map.flyTo([latitude, longitude], 17, { animate: true, duration: 0.5 });
          }
        },
        (err) => {
          console.error(err);
          // Show the user one toast per tracking session (permission denied,
          // GPS unavailable, etc) instead of either spamming on every retry
          // or — the previous behavior — never surfacing the error at all.
          if (!hasWarnedThisSession) {
            hasWarnedThisSession = true;
            toast({
              title: "Location unavailable",
              description:
                err.code === err.PERMISSION_DENIED
                  ? "Location permission denied. Enable it in your browser to track your position."
                  : "Couldn't get your location. Retrying...",
              variant: "destructive",
            });
          }
        },
        { enableHighAccuracy: true, maximumAge: 1000 },
      );
    } else {
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      // Revert the nav-arrow marker back to a normal pin at the last known position.
      const map = mapInstanceRef.current;
      if (userMarkerRef.current) {
        const { lat, lng } = userMarkerRef.current.getLatLng();
        userMarkerRef.current.remove();
        userMarkerRef.current = map
          ? L.marker([lat, lng]).addTo(map).bindPopup("You are here")
          : null;
      }
    }
  }, [isNavigating]);

  const fetchNavDestSuggestions = (query: string) => {
    if (navDestDebounceRef.current) clearTimeout(navDestDebounceRef.current);
    if (query.trim().length < 3) {
      setNavDestSuggestions([]);
      setShowNavDestSuggestions(false);
      return;
    }
    navDestDebounceRef.current = setTimeout(async () => {
      try {
        setNavDestLoading(true);
        // For a "where do I want to go" navigation search, bias results
        // toward the user's actual location — otherwise a common chain name
        // like "D-Mart" or "Domino's" returns branches from anywhere in the
        // country in no particular order, no more useful than the nearest
        // one. Falls back to wherever the map is currently centered (which
        // itself starts at the user's location on load) if geolocation
        // hasn't set userLocation yet.
        const bias =
          userLocation ||
          (() => {
            const c = mapInstanceRef.current?.getCenter();
            return c ? { lat: c.lat, lon: c.lng } : null;
          })();
        const biasParam = bias ? `&lat=${bias.lat}&lon=${bias.lon}` : "";
        const r = await fetch(`/api/v1/geocode?q=${encodeURIComponent(query.trim())}${biasParam}`);
        const data = await r.json();
        setNavDestSuggestions(Array.isArray(data) ? data : []);
        setShowNavDestSuggestions(true);
      } catch {
        setNavDestSuggestions([]);
      } finally {
        setNavDestLoading(false);
      }
    }, 350);
  };

  const selectNavDestSuggestion = (place: { lat: number; lon: number; display_name: string }) => {
    const name = place.display_name?.split(",")[0] || place.display_name;
    const lat = Number(place.lat);
    const lon = Number(place.lon);
    setSelectedPlace({ lat, lon, name });
    setNavDestInput(name);
    setShowNavDestSuggestions(false);
    setNavDestSuggestions([]);
    toast({ title: "Destination set", description: name });

    const map = mapInstanceRef.current;
    if (map) {
      if (markerRef.current) markerRef.current.remove();
      markerRef.current = L.marker([lat, lon]).addTo(map).bindPopup(name).openPopup();
      map.flyTo([lat, lon], 14, { duration: 1 });
    }
  };

  // One-shot location fetch for "Get Route" when live tracking isn't already
  // on — users shouldn't have to enable continuous tracking just to see a
  // single route.
  function getCurrentLocationOnce(): Promise<{ lat: number; lon: number }> {
    if (!navigator.geolocation) return Promise.reject(new Error("Geolocation not supported"));
    const attempt = (opts: PositionOptions) =>
      new Promise<{ lat: number; lon: number }>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
          (err) => reject(err),
          opts,
        );
      });
    // High-accuracy GPS can time out or report unavailable on devices
    // without a GPS chip (most desktops); fall back to coarser
    // network/IP-based positioning, which is slower to appear but far
    // more reliable, rather than surfacing "Location needed" outright.
    return attempt({ enableHighAccuracy: true, timeout: 8000 }).catch(() =>
      attempt({ enableHighAccuracy: false, timeout: 15000 }),
    );
  }

  // Routing via OSRM (open-source, no API key needed)
  const handleCalculateRoute = async () => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!selectedPlace) {
      toast({
        title: "No destination",
        description: "Search for and select a destination first.",
        variant: "destructive",
      });
      return;
    }

    let location = userLocation;
    if (!location) {
      try {
        location = await getCurrentLocationOnce();
        setUserLocation(location);
      } catch {
        toast({
          title: "Location needed",
          description: "Enable location access to calculate a route.",
          variant: "destructive",
        });
        return;
      }
    }

    try {
      const { lat: sLat, lon: sLon } = location;
      const { lat: dLat, lon: dLon } = selectedPlace;
      const url = `https://router.project-osrm.org/route/v1/driving/${sLon},${sLat};${dLon},${dLat}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      const json = await res.json();
      const coords: [number, number][] =
        json?.routes?.[0]?.geometry?.coordinates?.map(
          ([lng, lat]: [number, number]) => [lat, lng] as [number, number],
        ) ?? [];

      if (!coords.length) throw new Error("No route found");

      if (routePolylineRef.current) routePolylineRef.current.remove();
      routePolylineRef.current = L.polyline(coords, { color: "#1D4E89", weight: 4 }).addTo(map);
      map.fitBounds(L.latLngBounds(coords));
      setRoutePoints(coords);

      const distKm = (json.routes[0].distance / 1000).toFixed(1);
      const mins = Math.round(json.routes[0].duration / 60);
      toast({ title: "Route Ready", description: `${distKm} km · ~${mins} min driving` });
    } catch {
      toast({
        title: "Route unavailable",
        description: "Could not calculate route. Check connection.",
        variant: "destructive",
      });
    }
  };

  // --- Existing Fetch/Utility Logic (Briefly retained/adapted) --- //
  function parsePlaceItem(it: any): PlaceResult | null {
    if (!it) return null;
    const lat = Number(it.lat ?? it.latitude ?? it.location?.lat);
    const lon = Number(it.lon ?? it.longitude ?? it.location?.lng);
    if (Number.isNaN(lat)) return null;
    return {
      id: `${lat}-${lon}-${Math.random()}`,
      name: it.name || it.display_name?.split(",")[0] || "Unknown",
      displayName: it.display_name ?? "Unknown Location",
      lat,
      lon,
      category: it.type,
      city: it.address?.city,
      country: it.address?.country,
      photoUrl: it.imageUrl,
    };
  }

  async function fetchPlaces(query: string) {
    if (!query || query.length < 2) return;
    setPlacesLoading(true);
    try {
      // The backend's place search has no category filter — it's a raw text
      // search passthrough. The only way the Food/Hotels/Sights checkboxes can
      // actually affect results is by shaping the search text itself. When
      // every category (or none) is checked, search the plain query; when a
      // subset is checked, run one search per selected category and merge.
      const categoryTerms: Record<"food" | "hotel" | "sights", string> = {
        food: "restaurants",
        hotel: "hotels",
        sights: "tourist attractions",
      };
      const activeCategories = (Object.keys(filters) as Array<keyof typeof filters>).filter(
        (k) => filters[k],
      );
      const queries =
        activeCategories.length > 0 && activeCategories.length < 3
          ? activeCategories.map((c) => `${categoryTerms[c]} in ${query}`)
          : [query];

      const perQueryPageSize = Math.ceil(pageSize / queries.length);
      const results = await Promise.all(
        queries.map(async (q) => {
          const res = await fetch(
            `/api/v1/places/search?q=${encodeURIComponent(q)}&page=${page}&pageSize=${perQueryPageSize}`,
          );
          const j = await res.json();
          return { items: Array.isArray(j?.items) ? j.items : [], total: j?.total || 0 };
        }),
      );

      const seen = new Set<string>();
      const merged: PlaceResult[] = [];
      let totalCount = 0;
      for (const { items, total: t } of results) {
        totalCount += t;
        for (const it of items) {
          const parsedItem = parsePlaceItem(it);
          if (!parsedItem) continue;
          const key = `${parsedItem.lat.toFixed(4)},${parsedItem.lon.toFixed(4)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(parsedItem);
        }
      }

      setPlacesResults(merged);
      setTotal(totalCount);
    } catch {
      // Silent fail
    } finally {
      setPlacesLoading(false);
    }
  }

  // Re-run the active search when the category filters change, so toggling a
  // checkbox after a search actually updates the results instead of doing nothing.
  useEffect(() => {
    if (searchQuery.trim().length >= 2) fetchPlaces(searchQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.food, filters.hotel, filters.sights]);

  // Generate MapRegion from a place
  function addPlaceAsRegion(p: PlaceResult) {
    const newRegion: MapRegion = {
      id: `place-${p.id}`,
      name: p.name,
      country: p.country || "Unknown",
      bytes: 0,
      tileUrls: [],
      downloaded: false,
      downloading: false,
      progress: 0,
      lat: p.lat,
      lng: p.lon,
      zoom: 12,
    };
    setMapRegions((prev) => [...prev, newRegion]);
    toast({ title: "Map Added", description: `${p.name} added to list.` });
  }

  // View a place on the map (preview only, does not add to list)
  function viewPlaceOnMap(p: PlaceResult) {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.flyTo([p.lat, p.lon], 12, { duration: 1.1 });
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    const mk = L.marker([p.lat, p.lon])
      .addTo(map)
      .bindPopup(`<b>${p.displayName}</b><br/><small>Preview</small>`)
      .openPopup();
    markerRef.current = mk;
  }

  const downloadingRef = useRef<Set<string>>(new Set());

  async function downloadMap(regionId: string) {
    if (downloadingRef.current.has(regionId)) return; // Prevent double clicks
    const region = mapRegions.find((r) => r.id === regionId);
    if (!region) return;

    downloadingRef.current.add(regionId);
    setMapRegions((prev) =>
      prev.map((r) => (r.id === regionId ? { ...r, downloading: true, progress: 0 } : r)),
    );

    const urls = computeTileUrls(
      region.lat,
      region.lng,
      REGION_RADIUS_DEG,
      REGION_ZOOM_MIN,
      REGION_ZOOM_MAX,
      darkMode,
    );
    toast({
      title: "Download Started",
      description: `Fetching ${urls.length} map tiles for offline use...`,
    });

    try {
      const bytes = await downloadTiles(urls, (done, total) => {
        setMapRegions((prev) =>
          prev.map((r) =>
            r.id === regionId ? { ...r, progress: Math.round((done / total) * 100) } : r,
          ),
        );
      });

      setMapRegions((prev) =>
        prev.map((r) =>
          r.id === regionId
            ? {
                ...r,
                downloading: false,
                downloaded: true,
                progress: 100,
                bytes,
                tileUrls: urls,
                downloadedAt: Date.now(),
              }
            : r,
        ),
      );
      toast({
        title: "Download Complete",
        description: `${region.name} (${formatBytes(bytes)}) is now available offline`,
      });
    } catch (e) {
      setMapRegions((prev) =>
        prev.map((r) => (r.id === regionId ? { ...r, downloading: false, progress: 0 } : r)),
      );
      toast({
        title: "Download Failed",
        description: e instanceof Error ? e.message : "Could not cache map tiles.",
        variant: "destructive",
      });
    } finally {
      downloadingRef.current.delete(regionId);
    }
  }

  async function deleteMap(regionId: string) {
    const region = mapRegions.find((r) => r.id === regionId);
    downloadingRef.current.delete(regionId);

    if (region?.tileUrls?.length) {
      await deleteTiles(region.tileUrls);
    }

    setMapRegions((prev) => prev.filter((r) => r.id !== regionId));
    toast({ title: "Map Deleted", description: "Offline map removed." });
  }

  // Stats
  const downloadedCount = mapRegions.filter((r) => r.downloaded).length;
  const totalSize = mapRegions.filter((r) => r.downloaded).reduce((s, r) => s + r.bytes, 0);

  // Estimated size of a not-yet-downloaded region, before we know its real byte count.
  function estimateRegionBytes(): number {
    const tileCount = computeTileUrls(
      0,
      0,
      REGION_RADIUS_DEG,
      REGION_ZOOM_MIN,
      REGION_ZOOM_MAX,
      darkMode,
    ).length;
    return tileCount * 15_000;
  }

  return (
    <div className={`relative h-full w-full flex flex-col overflow-hidden ${className}`}>
      {/* Slim top bar — tabs + offline/dark-mode state, not a full page header */}
      <div className="flex-shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-card">
        <div className="flex space-x-1 bg-muted p-1 rounded-xl">
          <button
            onClick={() => setActiveTab("explore")}
            className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${activeTab === "explore" ? "bg-[#163F73] text-white shadow" : "text-muted-foreground hover:text-foreground"}`}
          >
            Explore
          </button>
          <button
            onClick={() => setActiveTab("navigation")}
            className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${activeTab === "navigation" ? "bg-[#163F73] text-white shadow" : "text-muted-foreground hover:text-foreground"}`}
          >
            Navigation
          </button>
          <button
            onClick={() => setActiveTab("saved")}
            className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${activeTab === "saved" ? "bg-[#163F73] text-white shadow" : "text-muted-foreground hover:text-foreground"}`}
          >
            Saved Pins
          </button>
        </div>
        {offlineModeRegion ? (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-mono uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-[3px] border border-[#3D9467] bg-[#3D9467]/10 text-[#3D9467] rotate-[-2deg] truncate max-w-[140px] sm:max-w-none">
              Offline: {offlineModeRegion.name}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={exitOfflineMap}
              className="h-6 w-6 p-0 rounded-full bg-[#B3261E]/10 hover:bg-[#B3261E]/20 text-[#B3261E] border border-[#B3261E]/50 flex items-center justify-center flex-shrink-0"
            >
              <i className="fas fa-times text-xs"></i>
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDarkMode(!darkMode)}
            className="text-muted-foreground hover:text-foreground flex-shrink-0"
            title={darkMode ? "Light Mode" : "Dark Mode"}
          >
            {darkMode ? <i className="fas fa-sun"></i> : <i className="fas fa-moon"></i>}
            <span className="hidden sm:inline ml-2">{darkMode ? "Light Mode" : "Dark Mode"}</span>
          </Button>
        )}
      </div>

      <div id={activeTab === "saved" ? "tab-indicator-saved" : undefined}></div>

      {/* Map fills all remaining space — the bottom sheet below is an overlay
          on top of it, not a document-flow sibling, so it never changes this
          container's size (no invalidateSize dance needed on toggle). */}
      <div className="relative flex-1 min-h-0" data-testid="offline-map-display">
        <div className="relative isolate w-full h-full overflow-hidden group">
          <div ref={mapContainerRef} className="w-full h-full bg-muted" style={{ zIndex: 0 }} />

          {!mapReady && (
            <div className="absolute inset-0 z-[500] flex flex-col items-center justify-center gap-2 bg-[hsl(var(--background))]">
              <div className="w-6 h-6 border-2 border-[var(--amber)] border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Locating you…</p>
            </div>
          )}

          {/* Navigation Overlay Controls */}
          {activeTab === "navigation" && (
            <div className="absolute top-2 left-12 right-2 sm:left-16 sm:right-auto z-[400] bg-card/95 backdrop-blur p-3 rounded-xl border border-border space-y-3 sm:w-64">
              <div className="flex items-center justify-between">
                <h4 className="text-foreground font-serif font-bold text-sm">Live Navigation</h4>
                <div className="sm:hidden flex items-center gap-2">
                  {isNavigating && (
                    <span className="text-[10px] font-mono uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-[3px] border border-[#3D9467] bg-[#3D9467]/10 text-[#3D9467] rotate-[-2deg] animate-pulse">
                      Live
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">Tracking</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isNavigating}
                  aria-label="Live tracking"
                  className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${isNavigating ? "bg-[#3D9467]" : "bg-muted"}`}
                  onClick={() => setIsNavigating(!isNavigating)}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${isNavigating ? "translate-x-6" : "translate-x-0"}`}
                  />
                </button>
              </div>

              <div className="border-t border-border pt-3">
                <h4 className="text-foreground font-serif font-bold text-sm mb-2">Route</h4>
                <div className="space-y-2 relative">
                  <input
                    type="text"
                    autoFocus
                    placeholder="Destination (city or place)"
                    value={navDestInput}
                    onChange={(e) => {
                      setNavDestInput(e.target.value);
                      fetchNavDestSuggestions(e.target.value);
                    }}
                    onFocus={() => {
                      if (navDestSuggestions.length > 0) setShowNavDestSuggestions(true);
                    }}
                    onBlur={() => setTimeout(() => setShowNavDestSuggestions(false), 150)}
                    onKeyDown={async (e) => {
                      if (e.key === "Enter" && navDestInput.trim()) {
                        if (navDestSuggestions.length > 0) {
                          selectNavDestSuggestion(navDestSuggestions[0]);
                          return;
                        }
                        try {
                          const r = await fetch(
                            `/api/v1/geocode?q=${encodeURIComponent(navDestInput.trim())}`,
                          );
                          const data = await r.json();
                          if (Array.isArray(data) && data.length > 0) {
                            selectNavDestSuggestion(data[0]);
                          } else {
                            toast({
                              title: "Not found",
                              description: "Try a different name.",
                              variant: "destructive",
                            });
                          }
                        } catch {
                          toast({ title: "Search failed", variant: "destructive" });
                        }
                      }
                    }}
                    className="w-full bg-muted border border-border rounded px-2 py-1 text-foreground text-xs placeholder:text-muted-foreground focus:outline-none focus:border-[#163F73]"
                  />
                  {showNavDestSuggestions && (navDestLoading || navDestSuggestions.length > 0) && (
                    <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl max-h-48 overflow-y-auto">
                      {navDestLoading && (
                        <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                          Searching...
                        </div>
                      )}
                      {!navDestLoading &&
                        navDestSuggestions.map((s, i) => (
                          <button
                            key={i}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => selectNavDestSuggestion(s)}
                            className="w-full text-left px-2 py-1.5 text-[11px] text-foreground hover:bg-muted truncate border-b border-border last:border-b-0"
                          >
                            {s.display_name}
                          </button>
                        ))}
                    </div>
                  )}
                  {selectedPlace && (
                    <p className="text-[10px] text-[#163F73] truncate">→ {selectedPlace.name}</p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs border-[#163F73] text-[#163F73] hover:bg-[#163F73] hover:text-white"
                      onClick={handleCalculateRoute}
                    >
                      Get Route
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs border-[#B3261E]/50 text-[#B3261E] hover:bg-[#B3261E]/10"
                      onClick={() => {
                        if (routePolylineRef.current) {
                          routePolylineRef.current.remove();
                          routePolylineRef.current = null;
                        }
                        if (markerRef.current) {
                          markerRef.current.remove();
                          markerRef.current = null;
                        }
                        setRoutePoints([]);
                        setSelectedPlace(null);
                        setNavDestInput("");
                        toast({ title: "Route Cleared" });
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Add Pin Button (Visible in Saved Tab) */}
          {activeTab === "saved" && (
            <div className="absolute top-2 right-2 sm:top-4 sm:right-4 z-[400]">
              <Button
                size="sm"
                onClick={() => {
                  const map = mapInstanceRef.current;
                  if (map) {
                    const center = map.getCenter();
                    setPendingPinCenter({ lat: center.lat, lng: center.lng });
                    setPinDialogOpen(true);
                  }
                }}
                className="bg-[#163F73] hover:bg-[#0F2C52] text-white rounded-xl text-xs sm:text-sm"
              >
                <i className="fas fa-plus mr-1 sm:mr-2"></i>
                <span className="hidden xs:inline">Add Pin</span>
                <span className="hidden sm:inline"> at Center</span>
              </Button>
            </div>
          )}

          <Button
            onClick={() => {
              // getCurrentPosition with no options has no default timeout
              // (spec allows Infinity) — on a device with no GPS/network
              // fallback (e.g. desktop offline) this could hang forever
              // with no visible feedback. getCurrentLocationOnce() already
              // has the correct high-accuracy-then-fallback timeout
              // handling (used by Get Route); reuse it here too.
              getCurrentLocationOnce()
                .then(({ lat, lon }) => {
                  const map = mapInstanceRef.current;
                  if (!map) return;
                  map.flyTo([lat, lon], 15);

                  // Add marker only when locating
                  if (userMarkerRef.current) userMarkerRef.current.remove();
                  userMarkerRef.current = L.marker([lat, lon])
                    .addTo(map)
                    .bindPopup("You are here")
                    .openPopup();

                  // Feed the same location into Get Route so users who've
                  // already located themselves here don't have to trigger a
                  // second, separate geolocation request from the Navigation tab.
                  setUserLocation({ lat, lon });
                })
                .catch(() => {
                  toast({
                    title: "Location unavailable",
                    description: "Couldn't get your position.",
                    variant: "destructive",
                  });
                });
            }}
            variant="secondary"
            size="icon"
            // z-[400] doesn't help against the sheet's z-[500] here — the
            // isolate div this button lives in is its own stacking
            // context, so its z-index only competes within that context,
            // never against the sheet in the outer one. Real fix is
            // geometric: sit clear above the peek bar's top edge (peek
            // bar occupies 76-132px from the container bottom), not
            // "under" it with a lower z-index. Previously hidden entirely
            // while the sheet was expanded (no way to re-center without
            // collapsing it first) — now stays visible and just moves
            // higher to clear the expanded sheet instead.
            className="absolute right-4 z-[400] bg-card text-foreground rounded-full border border-border transition-all"
            style={{ bottom: sheetExpanded ? 200 : 140 }}
            title="Locate Me"
          >
            <i className="fas fa-crosshairs"></i>
          </Button>
        </div>

        {/* Bottom sheet — an overlay on top of the map (absolute, not a
              flow sibling), so expanding/collapsing it never resizes the map
              container. bottom-[76px] on mobile clears the fixed bottom nav;
              md:bottom-0 because the desktop sidebar layout has no bottom nav
              to clear. */}
        <motion.div
          className="absolute left-0 right-0 bottom-[76px] md:bottom-0 z-[500] bg-card border-t border-[#163F73]/40 rounded-t-2xl flex flex-col overflow-hidden"
          animate={{ height: sheetExpanded ? "65%" : 56 }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          style={{ maxHeight: "80%" }}
        >
          <button
            onClick={() => setSheetExpanded((v) => !v)}
            className="relative flex-shrink-0 flex items-center justify-between gap-3 px-4 h-14 w-full text-left"
            aria-expanded={sheetExpanded}
            aria-label="Toggle map details panel"
          >
            <div className="absolute left-1/2 -translate-x-1/2 top-1.5 w-10 h-1 rounded-full bg-border" />
            <div className="flex items-center gap-2 min-w-0 mt-1.5">
              <i className="fas fa-sliders-h text-muted-foreground text-sm"></i>
              <span className="text-sm font-medium text-foreground truncate">
                <span className="font-mono">{formatBytes(totalSize)}</span> /{" "}
                <span className="font-mono">2 GB</span> used
              </span>
            </div>
            {/* Bouncing while collapsed — a static chevron reads as
                  decoration; motion is what actually signals "more content,
                  tap or drag to reveal" for a sheet that isn't obviously
                  interactive at a glance. */}
            <i
              className={`fas fa-chevron-up text-muted-foreground text-xs transition-transform mt-1.5 ${sheetExpanded ? "rotate-180" : "animate-bounce"}`}
              aria-hidden="true"
            ></i>
          </button>

          {sheetExpanded && (
            <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-4">
              {/* Filtering & Search only visible in Explore */}
              {activeTab === "explore" && (
                <Card className="bg-card border-border">
                  <CardHeader>
                    <CardTitle className="text-foreground text-base">Search Places</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        placeholder="Search city..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            fetchPlaces(searchQuery);
                          }
                        }}
                        className="bg-muted border-border text-foreground flex-1"
                      />
                      <Button
                        onClick={() => fetchPlaces(searchQuery)}
                        disabled={placesLoading}
                        className="bg-[#163F73] hover:bg-[#0F2C52] rounded-xl w-full sm:w-auto"
                      >
                        {placesLoading ? "Searching..." : "Search"}
                      </Button>
                    </div>
                    {placesLoading && (
                      <div className="text-center py-4 text-sm text-muted-foreground">
                        Searching...
                      </div>
                    )}

                    {/* Category Filters */}
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center space-x-2 text-foreground text-sm cursor-pointer">
                        <Checkbox
                          checked={filters.food}
                          onCheckedChange={(c) => setFilters((f) => ({ ...f, food: !!c }))}
                        />
                        <span>Food</span>
                      </label>
                      <label className="flex items-center space-x-2 text-foreground text-sm cursor-pointer">
                        <Checkbox
                          checked={filters.hotel}
                          onCheckedChange={(c) => setFilters((f) => ({ ...f, hotel: !!c }))}
                        />
                        <span>Hotels</span>
                      </label>
                      <label className="flex items-center space-x-2 text-foreground text-sm cursor-pointer">
                        <Checkbox
                          checked={filters.sights}
                          onCheckedChange={(c) => setFilters((f) => ({ ...f, sights: !!c }))}
                        />
                        <span>Sights</span>
                      </label>
                    </div>

                    {placesResults.length > 0 && (
                      <div className="grid gap-2 max-h-60 overflow-y-auto">
                        {placesResults.map((p) => (
                          <div
                            key={p.id}
                            className="p-3 border-b border-border hover:bg-secondary/50 cursor-pointer transition-colors flex gap-3"
                            onClick={() => {
                              viewPlaceOnMap(p); // Assuming handlePlaceSelect is viewPlaceOnMap
                            }}
                          >
                            {p.photoUrl && (
                              <div className="w-16 h-16 shrink-0 rounded-md overflow-hidden bg-muted">
                                <img
                                  src={p.photoUrl}
                                  alt={p.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-foreground truncate">{p.name}</div>
                              <div className="text-xs text-muted-foreground truncate">
                                {p.displayName}
                              </div>
                              {p.category && (
                                <div className="mt-1">
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-[3px] border border-[#1D4E89] rotate-[-2deg] text-[10px] font-mono uppercase tracking-[0.05em] bg-[#1D4E89]/10 text-[#1D4E89]">
                                    {p.category.replace(/_/g, " ")}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2 items-center">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  viewPlaceOnMap(p);
                                }}
                              >
                                View
                              </Button>
                              <Button
                                size="sm"
                                variant="default"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addPlaceAsRegion(p);
                                }}
                              >
                                Save
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Storage Dashboard */}
              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-foreground text-base">Storage Usage</CardTitle>
                    <span className="text-xs text-muted-foreground font-mono">
                      {formatBytes(totalSize)} / 2 GB
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <Progress
                    value={(totalSize / (2 * 1024 * 1024 * 1024)) * 100}
                    className="h-2 bg-muted [&>div]:bg-[#163F73]"
                  />
                  <p className="text-[10px] text-muted-foreground mt-2 text-right">
                    Offline maps auto-expire after 30 days of inactivity
                  </p>
                </CardContent>
              </Card>

              {/* Region Grid */}
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-foreground">Saved Regions</CardTitle>
                </CardHeader>
                <CardContent>
                  {mapRegions.length === 0 ? (
                    <div className="text-muted-foreground text-sm py-8 text-center border-2 border-dashed border-border rounded-lg">
                      <i className="fas fa-map-marked-alt text-4xl mb-3 opacity-50"></i>
                      <p>No saved regions yet.</p>
                      <p className="text-xs mt-1">Search for a city above to add it.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {mapRegions.map((r) => (
                        <div
                          key={r.id}
                          className="bg-muted rounded-xl overflow-hidden border border-border group relative"
                        >
                          {/* Region header — solid ink-navy surface, not a gradient
                      placeholder standing in for a real map thumbnail. */}
                          <div className="h-24 bg-[#0D1B2E] relative">
                            <div className="absolute bottom-2 left-3">
                              <h3 className="font-serif font-bold text-lg text-white leading-tight">
                                {r.name}
                              </h3>
                              <p className="text-xs text-white/60">{r.country}</p>
                            </div>
                            {r.downloaded && (
                              <div className="absolute top-2 right-2 text-[10px] font-mono uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-[3px] border border-[#3D9467] bg-[#3D9467]/10 text-[#3D9467] rotate-[-2deg]">
                                Saved
                              </div>
                            )}
                          </div>

                          <div className="p-3">
                            <div className="flex justify-between items-center mb-3">
                              <span className="text-xs text-muted-foreground font-mono-data">
                                {r.downloaded
                                  ? formatBytes(r.bytes)
                                  : `~${formatBytes(estimateRegionBytes())}`}
                              </span>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-[#B3261E] hover:text-[#B3261E] hover:bg-[#B3261E]/10"
                                onClick={() => deleteMap(r.id)}
                              >
                                <i className="fas fa-trash text-xs"></i>
                              </Button>
                            </div>

                            {r.downloaded ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => openOfflineMap(r)}
                                className="w-full rounded-xl bg-[#3D9467]/10 text-[#3D9467] hover:bg-[#3D9467]/20 border border-[#3D9467]/60 transition-all font-semibold"
                              >
                                <i className="fas fa-map-marked-alt mr-2"></i> Open Map
                              </Button>
                            ) : r.downloading ? (
                              <div className="space-y-1">
                                <div className="flex justify-between text-[10px] font-mono text-[#1D4E89]">
                                  <span>Saving...</span>
                                  <span>{Math.round(r.progress)}%</span>
                                </div>
                                <Progress value={r.progress} className="h-1.5" />
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full rounded-xl border-[#1D4E89] text-[#1D4E89] hover:bg-[#1D4E89] hover:text-white transition-colors"
                                onClick={() => downloadMap(r.id)}
                              >
                                <i className="fas fa-download mr-1"></i> Download
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </motion.div>
      </div>

      <NamePromptDialog
        open={pinDialogOpen}
        title="Pin name"
        defaultValue="New Location"
        confirmLabel="Add Pin"
        onOpenChange={setPinDialogOpen}
        onConfirm={async (name) => {
          if (!pendingPinCenter) return;
          try {
            const res = await apiRequest("POST", "/api/v1/map-pins", {
              lat: pendingPinCenter.lat,
              lng: pendingPinCenter.lng,
              name,
              color: "#B3261E", // stamp-red — DESIGN.md's "marked" ink role
            });
            if (!res.ok) throw new Error("create_failed");
            const saved: CustomPin = await res.json();
            setCustomPins((prev) => [...prev, saved]);
          } catch {
            toast({
              title: "Couldn't save pin",
              description: "Try again.",
              variant: "destructive",
            });
          }
        }}
      />
    </div>
  );
}
