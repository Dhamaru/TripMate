import { useState, useEffect, useRef } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface MapRegion {
  id: string;
  name: string;
  country: string;
  size: string;
  downloaded: boolean;
  downloading: boolean;
  progress: number;
  lat: number;
  lng: number;
  zoom: number;
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
  const [activeTab, setActiveTab] = useState<'explore' | 'navigation' | 'saved'>('explore');
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRegion, setSelectedRegion] = useState<MapRegion | null>(null);
  const [darkMode, setDarkMode] = useState(true);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const [offlineModeRegion, setOfflineModeRegion] = useState<MapRegion | null>(null);

  function openOfflineMap(region: MapRegion) {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Simulate restricting map to this region
    const bounds = L.latLngBounds(
      [region.lat - 0.05, region.lng - 0.05],
      [region.lat + 0.05, region.lng + 0.05]
    );

    map.setMaxBounds(bounds.pad(0.5)); // Allow a little padding buffer
    map.fitBounds(bounds);
    map.setMinZoom(11); // Don't allow zooming out too far

    setOfflineModeRegion(region);
    toast({ title: `Opened ${region.name}`, description: "You are now viewing the offline map area." });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function exitOfflineMap() {
    const map = mapInstanceRef.current;
    if (!map) return;

    map.setMaxBounds([[-90, -180], [90, 180]]); // Clear restriction (World bounds)
    map.setMinZoom(2);
    map.setView([20, 0], 2);
    setOfflineModeRegion(null);
    toast({ title: "Exited Offline View", description: "Showing world map." });
  }

  // Custom Pins State
  const [customPins, setCustomPins] = useState<CustomPin[]>(() => {
    try {
      const raw = localStorage.getItem(PINS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

  const [mapRegions, setMapRegions] = useState<MapRegion[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as MapRegion[];
    } catch { }
    return DEFAULT_REGIONS;
  });

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
  const intervalsRef = useRef<Record<string, number>>({});
  const placesAbortRef = useRef<AbortController | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // Persist regions & pins
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(mapRegions)); } catch { }
  }, [mapRegions]);

  useEffect(() => {
    try { localStorage.setItem(PINS_STORAGE_KEY, JSON.stringify(customPins)); } catch { }
    refreshPinMarkers();
  }, [customPins]);

  // Clean up markers helper
  const clearPinMarkers = () => {
    pinMarkersRef.current.forEach(m => m.remove());
    pinMarkersRef.current = [];
  };

  const refreshPinMarkers = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    clearPinMarkers();

    customPins.forEach(pin => {
      const icon = L.divIcon({
        className: 'custom-pin-icon',
        html: `<div style="background-color: ${pin.color}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
        iconSize: [20, 20]
      });
      const marker = L.marker([pin.lat, pin.lng], { icon })
        .addTo(map)
        .bindPopup(`<b>${pin.name}</b><br/>${pin.note || ''}<br/><button onclick="window.dispatchEvent(new CustomEvent('delete-pin', {detail: '${pin.id}'}))" style="color:red; font-size:10px; margin-top:4px;">Delete</button>`);
      pinMarkersRef.current.push(marker);
    });
  };

  // Initialize Leaflet
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
      iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
      shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    });

    const map = L.map(mapContainerRef.current, { zoomControl: true }).setView([20, 0], 2);

    const darkUrl = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png";
    const lightUrl = "https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png";

    const layer = L.tileLayer(darkMode ? darkUrl : lightUrl, {
      attribution: '&copy; CARTO',
      maxZoom: 18,
    }).addTo(map);

    tileLayerRef.current = layer;

    mapInstanceRef.current = map;



    // Map Click Listener for Custom Pins
    map.on('click', (e) => {
      // Accessing activeTab from ref would be better but for simplicity in this effect:
      // We rely on the button add approach or prompt if mode is enabled.
      // Actually checking a ref or global var is safer in closures.
      // For now, I'll add a separate "Add Pin" mode toggle or just check tab in a ref if I had one.
      // Simpler: Just rely on the UI button to add pin at center, or use a specific event if "Saved" tab is active.

      const isSavedTab = document.getElementById('tab-indicator-saved') !== null; // Hacky check if we don't have ref

      // Let's use a cleaner approach: user clicks "Add Pin" button, then clicks map.
      // Or just prompt on click if in 'saved' tab.
      // Since state `activeTab` isn't accessible in this closure easily without ref, 
      // I will rely on a "Add Pin Current Location" button in the UI instead of click-map for stability.
    });

    // Event listener for pin deletion (via popup)
    window.addEventListener('delete-pin', ((e: CustomEvent) => {
      setCustomPins(prev => prev.filter(p => p.id !== e.detail));
      toast({ title: "Pin Deleted" });
    }) as EventListener);


    // Initial state: Prioritize Geolocation
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          // Auto-locate: Just center the map, don't add a marker until requested
          map.setView([pos.coords.latitude, pos.coords.longitude], 13);
        },
        (err) => {
          console.error("Auto-locate failed, falling back to downloaded regions", err);
          // Fallback: Use downloaded region if available
          const downloadedRegion = mapRegions.find((r) => r.downloaded) ?? mapRegions[0];
          if (downloadedRegion) {
            map.setView([downloadedRegion.lat, downloadedRegion.lng], downloadedRegion.zoom);
          }
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else {
      // No Geo support: specific fallback
      const downloadedRegion = mapRegions.find((r) => r.downloaded) ?? mapRegions[0];
      if (downloadedRegion) {
        map.setView([downloadedRegion.lat, downloadedRegion.lng], downloadedRegion.zoom);
      }
    }

    refreshPinMarkers();

    return () => {
      Object.values(intervalsRef.current).forEach((id) => clearInterval(id));
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  // Toggle Dark Mode
  useEffect(() => {
    if (tileLayerRef.current) {
      tileLayerRef.current.setUrl(
        darkMode
          ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
          : "https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png"
      );
    }
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

      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, heading } = pos.coords;
          const map = mapInstanceRef.current;

          if (heading) setCurrentHeading(heading);

          if (map) {
            // Update User Marker
            if (userMarkerRef.current) userMarkerRef.current.remove();

            // Navigation Arrow Icon
            const arrowHtml = `
              <div style="
                transform: rotate(${heading || 0}deg); 
                transition: transform 0.3s ease;
                width: 0; 
                height: 0; 
                border-left: 10px solid transparent;
                border-right: 10px solid transparent;
                border-bottom: 20px solid #3b82f6;
                filter: drop-shadow(0 2px 2px rgba(0,0,0,0.5));
              "></div>`;

            const navIcon = L.divIcon({
              className: 'nav-arrow-icon',
              html: arrowHtml,
              iconSize: [20, 20],
              iconAnchor: [10, 10]
            });

            userMarkerRef.current = L.marker([latitude, longitude], { icon: navIcon }).addTo(map);

            // Auto Follow
            map.flyTo([latitude, longitude], 17, { animate: true, duration: 0.5 });
          }
        },
        (err) => {
          console.error(err);
          // Don't spam toasts on recurring errors
        },
        { enableHighAccuracy: true, maximumAge: 1000 }
      );
    } else {
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    }
  }, [isNavigating]);


  // Routing Logic (Basic Straight Line)
  const handleCalculateRoute = () => {
    // Mocking functionality: If we have a destination selected (Preview or Pin), draw line from map center.
    const map = mapInstanceRef.current;
    if (!map) return;

    const center = map.getCenter();
    // Random offset for demo route
    const dest = { lat: center.lat + 0.01, lng: center.lng + 0.01 };

    if (routePolylineRef.current) routePolylineRef.current.remove();

    const points: [number, number][] = [
      [center.lat, center.lng],
      [dest.lat, dest.lng]
    ];

    routePolylineRef.current = L.polyline(points, { color: 'blue', dashArray: '5, 10' }).addTo(map);
    map.fitBounds(L.latLngBounds(points));
    setRoutePoints(points);
    toast({ title: "Route Calculated", description: "Showing basic direction line." });
  };


  // --- Existing Fetch/Utility Logic (Briefly retained/adapted) --- //
  function parsePlaceItem(it: any): PlaceResult | null {
    if (!it) return null;
    const lat = Number(it.lat ?? it.latitude);
    const lon = Number(it.lon ?? it.longitude);
    if (Number.isNaN(lat)) return null;
    return {
      id: `${lat}-${lon}-${Math.random()}`,
      name: it.name || it.display_name?.split(',')[0] || "Unknown",
      displayName: it.display_name ?? "Unknown Location",
      lat, lon,
      category: it.type,
      city: it.address?.city,
      country: it.address?.country,
      photoUrl: it.photoUrl, // Added photoUrl
    };
  }

  async function fetchPlaces(query: string) {
    if (!query || query.length < 2) return;
    setPlacesLoading(true);
    try {
      const url = `/api/v1/places/search?q=${encodeURIComponent(query)}&page=${page}&pageSize=${pageSize}`;
      const res = await fetch(url);
      const j = await res.json();
      const arr = Array.isArray(j?.items) ? j.items : [];
      let parsed = arr.map(parsePlaceItem).filter(Boolean) as PlaceResult[];

      setPlacesResults(parsed);
      setTotal(j?.total || 0);
    } catch {
      // Silent fail
    } finally {
      setPlacesLoading(false);
    }
  }

  // Generate MapRegion from a place
  function addPlaceAsRegion(p: PlaceResult) {
    const newRegion: MapRegion = {
      id: `place-${p.id}`,
      name: p.name,
      country: p.country || "Unknown",
      size: "20 MB",
      downloaded: false,
      downloading: false,
      progress: 0,
      lat: p.lat,
      lng: p.lon,
      zoom: 12
    };
    setMapRegions(prev => [...prev, newRegion]);
    toast({ title: "Map Added", description: `${p.name} added to list.` });
  }

  // View a place on the map (preview only, does not add to list)
  function viewPlaceOnMap(p: PlaceResult) {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.flyTo([p.lat, p.lon], 12, { duration: 1.1 });
    if (markerRef.current) { markerRef.current.remove(); markerRef.current = null; }
    const mk = L.marker([p.lat, p.lon])
      .addTo(map)
      .bindPopup(`<b>${p.displayName}</b><br/><small>Preview</small>`)
      .openPopup();
    markerRef.current = mk;
  }

  function downloadMap(regionId: string) {
    if (intervalsRef.current[regionId]) return; // Prevent double clicks

    setMapRegions((prev) => prev.map((r) => (r.id === regionId ? { ...r, downloading: true, progress: 0 } : r)));
    toast({ title: "Download Started", description: "Downloading map for offline use..." });

    const id = window.setInterval(() => {
      setMapRegions((prev) => {
        const idx = prev.findIndex((p) => p.id === regionId);
        if (idx === -1) {
          // Region deleted while downloading
          clearInterval(intervalsRef.current[regionId]);
          delete intervalsRef.current[regionId];
          return prev;
        }

        const region = prev[idx];
        // Simulate speed variation
        const inc = Math.max(5, Math.random() * 15);
        const nextProg = Math.min(100, region.progress + inc);

        if (nextProg >= 100) {
          clearInterval(intervalsRef.current[regionId]);
          delete intervalsRef.current[regionId];

          // Use setTimeout to avoid render-cycle conflict for toast, but ensure it only runs once per completion
          setTimeout(() => {
            toast({ title: "Download Complete", description: `${region.name} map is now available offline` });
          }, 0);

          const updated = [...prev];
          updated[idx] = { ...region, progress: 100, downloading: false, downloaded: true };
          return updated;
        }

        const updated = [...prev];
        updated[idx] = { ...region, progress: nextProg, downloading: true };
        return updated;
      });
    }, 500);

    intervalsRef.current[regionId] = id;
  }

  function deleteMap(regionId: string) {
    // Clear any active download interval
    if (intervalsRef.current[regionId]) {
      clearInterval(intervalsRef.current[regionId]);
      delete intervalsRef.current[regionId];
    }

    // Remove from state (and thus from localStorage via useEffect)
    setMapRegions((prev) => prev.filter((region) => region.id !== regionId));
    toast({ title: "Map Deleted", description: "Offline map removed." });
  }

  // Stats
  const downloadedCount = mapRegions.filter((r) => r.downloaded).length;
  const totalSize = mapRegions.filter((r) => r.downloaded).reduce((s, r) => s + parseInt(r.size), 0); // simplified int parse

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Tab Navigation */}
      <div className="flex space-x-2 bg-ios-darker p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('explore')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'explore' ? 'bg-ios-blue text-white shadow' : 'text-gray-400 hover:text-white'}`}
        >
          Explore
        </button>
        <button
          onClick={() => setActiveTab('navigation')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'navigation' ? 'bg-ios-blue text-white shadow' : 'text-gray-400 hover:text-white'}`}
        >
          Navigation
        </button>
        <button
          onClick={() => setActiveTab('saved')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'saved' ? 'bg-ios-blue text-white shadow' : 'text-gray-400 hover:text-white'}`}
        >
          Saved Pins
        </button>
      </div>

      <div id={activeTab === 'saved' ? 'tab-indicator-saved' : undefined}></div>

      <Card className="bg-ios-card border-ios-gray" data-testid="offline-map-display">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-lg font-bold text-white flex gap-2 items-center">
              {offlineModeRegion ? (
                <>
                  <span className="text-green-400">Offline View:</span> {offlineModeRegion.name}
                  <Button variant="ghost" size="sm" onClick={exitOfflineMap} className="ml-3 h-7 w-7 p-0 rounded-full bg-red-500/20 hover:bg-red-500/40 text-red-400 border border-red-500/50 transition-colors flex items-center justify-center">
                    <i className="fas fa-times text-xs"></i>
                  </Button>
                </>
              ) : (
                <>
                  <span>Interactive Map</span>
                  {isNavigating && <span className="text-green-400 text-sm animate-pulse flex items-center gap-1"><i className="fas fa-circle text-[8px]"></i> Live</span>}
                </>
              )}
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDarkMode(!darkMode)}
              className="text-gray-400 hover:text-white"
            >
              {darkMode ? <i className="fas fa-sun mr-2"></i> : <i className="fas fa-moon mr-2"></i>}
              {darkMode ? "Light Mode" : "Dark Mode"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative w-full h-[500px] rounded-xl overflow-hidden group">
            <div ref={mapContainerRef} className="w-full h-full bg-ios-darker" style={{ zIndex: 0 }} />

            {/* Navigation Overlay Controls */}
            {activeTab === 'navigation' && (
              <div className="absolute top-4 left-16 z-[400] bg-ios-card/90 backdrop-blur p-3 rounded-lg border border-gray-700 shadow-xl space-y-3 w-64">
                <h4 className="text-white font-semibold text-sm">Live Navigation</h4>
                <div className="flex items-center justify-between">
                  <span className="text-gray-300 text-xs">Tracking</span>
                  <div
                    className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${isNavigating ? 'bg-green-500' : 'bg-gray-600'}`}
                    onClick={() => setIsNavigating(!isNavigating)}
                  >
                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${isNavigating ? 'translate-x-6' : 'translate-x-0'}`} />
                  </div>
                </div>

                <div className="border-t border-gray-700 pt-3">
                  <h4 className="text-white font-semibold text-sm mb-2">Quick Route</h4>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={handleCalculateRoute}>
                      Draw Line
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs border-red-500/50 text-red-400 hover:bg-red-500/10"
                      onClick={() => {
                        if (routePolylineRef.current) {
                          routePolylineRef.current.remove();
                          routePolylineRef.current = null;
                        }
                        setRoutePoints([]);
                        toast({ title: "Route Cleared" });
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Add Pin Button (Visible in Saved Tab) */}
            {activeTab === 'saved' && (
              <div className="absolute top-4 right-4 z-[400]">
                <Button
                  size="sm"
                  onClick={() => {
                    const map = mapInstanceRef.current;
                    if (map) {
                      const center = map.getCenter();
                      const name = prompt("Pin Name:", "New Location");
                      if (name) {
                        const newPin: CustomPin = {
                          id: Date.now().toString(),
                          lat: center.lat,
                          lng: center.lng,
                          name,
                          color: '#ef4444'
                        };
                        setCustomPins(prev => [...prev, newPin]);
                      }
                    }
                  }}
                  className="bg-ios-blue text-white shadow-lg"
                >
                  + Add Pin at Center
                </Button>
              </div>
            )}

            <Button
              onClick={() => {
                navigator.geolocation.getCurrentPosition(p => {
                  const map = mapInstanceRef.current;
                  if (!map) return;
                  const { latitude, longitude } = p.coords;
                  map.flyTo([latitude, longitude], 15);

                  // Add marker only when locating
                  if (userMarkerRef.current) userMarkerRef.current.remove();
                  userMarkerRef.current = L.marker([latitude, longitude])
                    .addTo(map)
                    .bindPopup("You are here")
                    .openPopup();
                });
              }}
              variant="secondary"
              size="icon"
              className="absolute bottom-4 right-4 z-[400] bg-white text-black rounded-full"
              title="Locate Me"
            >
              <i className="fas fa-crosshairs"></i>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filtering & Search only visible in Explore */}
      {activeTab === 'explore' && (
        <Card className="bg-ios-card border-ios-gray">
          <CardHeader>
            <CardTitle className="text-white text-base">Search Places</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Search city..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    fetchPlaces(searchQuery);
                  }
                }}
                className="bg-ios-darker border-ios-gray text-white"
              />
              <Button onClick={() => fetchPlaces(searchQuery)} className="bg-ios-blue">Search</Button>
            </div>

            {/* Category Filters */}
            <div className="flex gap-4">
              <label className="flex items-center space-x-2 text-white text-sm cursor-pointer">
                <Checkbox checked={filters.food} onCheckedChange={(c) => setFilters(f => ({ ...f, food: !!c }))} />
                <span>Food</span>
              </label>
              <label className="flex items-center space-x-2 text-white text-sm cursor-pointer">
                <Checkbox checked={filters.hotel} onCheckedChange={(c) => setFilters(f => ({ ...f, hotel: !!c }))} />
                <span>Hotels</span>
              </label>
              <label className="flex items-center space-x-2 text-white text-sm cursor-pointer">
                <Checkbox checked={filters.sights} onCheckedChange={(c) => setFilters(f => ({ ...f, sights: !!c }))} />
                <span>Sights</span>
              </label>
            </div>

            {placesResults.length > 0 && (
              <div className="grid gap-2 max-h-60 overflow-y-auto">
                {placesResults.map(p => (
                  <div
                    key={p.id}
                    className="p-3 border-b border-border hover:bg-secondary/50 cursor-pointer transition-colors flex gap-3"
                    onClick={() => {
                      viewPlaceOnMap(p); // Assuming handlePlaceSelect is viewPlaceOnMap
                    }}
                  >
                    {p.photoUrl && (
                      <div className="w-16 h-16 shrink-0 rounded-md overflow-hidden bg-muted">
                        <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-foreground truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{p.displayName}</div>
                      {p.category && (
                        <div className="mt-1">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-ios-blue/10 text-ios-blue capitalize">
                            {p.category.replace(/_/g, ' ')}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 items-center">
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); viewPlaceOnMap(p); }}>View</Button>
                      <Button size="sm" variant="default" onClick={(e) => { e.stopPropagation(); addPlaceAsRegion(p); }}>Save</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Storage Dashboard */}
      <Card className="bg-ios-card border-ios-gray">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <CardTitle className="text-white text-base">Storage Usage</CardTitle>
            <span className="text-xs text-ios-gray">{totalSize} MB / 2 GB</span>
          </div>
        </CardHeader>
        <CardContent>
          <Progress value={(totalSize / 2048) * 100} className="h-2 bg-gray-700 [&>div]:bg-blue-500" />
          <p className="text-[10px] text-gray-400 mt-2 text-right">Offline maps auto-expire after 30 days of inactivity</p>
        </CardContent>
      </Card>

      {/* Region Grid */}
      <Card className="bg-ios-card border-ios-gray">
        <CardHeader><CardTitle className="text-white">Saved Regions</CardTitle></CardHeader>
        <CardContent>
          {mapRegions.length === 0 ? (
            <div className="text-gray-500 text-sm py-8 text-center border-2 border-dashed border-gray-700 rounded-lg">
              <i className="fas fa-map-marked-alt text-4xl mb-3 opacity-50"></i>
              <p>No saved regions yet.</p>
              <p className="text-xs mt-1">Search for a city above to add it.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {mapRegions.map(r => (
                <div key={r.id} className="bg-ios-darker rounded-xl overflow-hidden border border-gray-800 group relative">
                  {/* Fake Map Preview Header */}
                  <div className="h-24 bg-gradient-to-br from-gray-800 to-gray-900 relative">
                    <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#9ca3af 1px, transparent 1px)', backgroundSize: '10px 10px' }}></div>
                    <div className="absolute bottom-2 left-3">
                      <h3 className="font-bold text-lg text-white leading-tight">{r.name}</h3>
                      <p className="text-xs text-gray-300">{r.country}</p>
                    </div>
                    {r.downloaded && <div className="absolute top-2 right-2 bg-green-500/20 text-green-400 text-[10px] px-2 py-0.5 rounded-full border border-green-500/50">SAVED</div>}
                  </div>

                  <div className="p-3">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs text-gray-400 font-mono">{r.size}</span>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-red-400 hover:text-red-300 hover:bg-red-400/10" onClick={() => deleteMap(r.id)}>
                        <i className="fas fa-trash text-xs"></i>
                      </Button>
                    </div>

                    {r.downloaded ? (
                      <Button size="sm" variant="secondary" onClick={() => openOfflineMap(r)} className="w-full bg-green-600/20 text-green-400 hover:bg-green-600/30 border border-green-600/50 transition-all font-semibold shadow-sm hover:shadow-green-900/20">
                        <i className="fas fa-map-marked-alt mr-2"></i> Open Map
                      </Button>
                    ) : r.downloading ? (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-blue-400">
                          <span>Saving...</span>
                          <span>{Math.round(r.progress)}%</span>
                        </div>
                        <Progress value={r.progress} className="h-1.5" />
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" className="w-full border-ios-blue text-ios-blue hover:bg-ios-blue hover:text-white transition-colors" onClick={() => downloadMap(r.id)}>
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
  );
}
