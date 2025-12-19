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

const STORAGE_KEY = "tripmate_offlinemaps_v1";
const PINS_STORAGE_KEY = "tripmate_custom_pins_v1";

const DEFAULT_REGIONS: MapRegion[] = [
  { id: "1", name: "Paris", country: "France", size: "45 MB", downloaded: true, downloading: false, progress: 100, lat: 48.8566, lng: 2.3522, zoom: 12 },
  { id: "2", name: "Tokyo", country: "Japan", size: "62 MB", downloaded: false, downloading: false, progress: 0, lat: 35.6762, lng: 139.6503, zoom: 12 },
  { id: "3", name: "New York City", country: "United States", size: "38 MB", downloaded: false, downloading: false, progress: 0, lat: 40.7128, lng: -74.0060, zoom: 12 },
  { id: "5", name: "Mumbai", country: "India", size: "52 MB", downloaded: false, downloading: false, progress: 0, lat: 19.0760, lng: 72.8777, zoom: 12 },
  { id: "15", name: "Delhi", country: "India", size: "56 MB", downloaded: false, downloading: false, progress: 0, lat: 28.7041, lng: 77.1025, zoom: 12 },
];

export function OfflineMaps({ className = "" }: OfflineMapsProps) {
  const [activeTab, setActiveTab] = useState<'explore' | 'navigation' | 'saved'>('explore');
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRegion, setSelectedRegion] = useState<MapRegion | null>(null);

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
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png", {
      attribution: '&copy; CARTO',
      maxZoom: 18,
    }).addTo(map);

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


    // Initial state
    const downloadedRegion = mapRegions.find((r) => r.downloaded) ?? mapRegions[0];
    if (downloadedRegion) {
      map.setView([downloadedRegion.lat, downloadedRegion.lng], downloadedRegion.zoom);
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
      name: it.display_name?.split(',')[0] ?? "Unknown",
      displayName: it.display_name ?? "Unknown Location",
      lat, lon,
      category: it.type,
      city: it.address?.city,
      country: it.address?.country
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
    setMapRegions((prev) => prev.map((r) => (r.id === regionId ? { ...r, downloading: true, progress: 0 } : r)));
    toast({ title: "Download Started", description: "Downloading map for offline use..." });

    if (intervalsRef.current[regionId]) { clearInterval(intervalsRef.current[regionId]); delete intervalsRef.current[regionId]; }

    const id = window.setInterval(() => {
      setMapRegions((prev) => {
        const idx = prev.findIndex((p) => p.id === regionId);
        if (idx === -1) return prev;
        const region = prev[idx];
        const inc = Math.max(5, Math.random() * 18);
        const nextProg = Math.min(100, region.progress + inc);
        const updated = [...prev];
        updated[idx] = { ...region, progress: nextProg, downloading: nextProg < 100, downloaded: nextProg >= 100 ? true : region.downloaded };
        if (nextProg >= 100) {
          setTimeout(() => toast({ title: "Download Complete", description: `${region.name} map is now available offline` }), 120);
        }
        return updated;
      });
    }, 600);

    intervalsRef.current[regionId] = id;
  }

  function deleteMap(regionId: string) {
    setMapRegions((prev) => prev.map((region) => (region.id === regionId ? { ...region, downloaded: false, progress: 0 } : region)));
    const region = mapRegions.find((r) => r.id === regionId);
    toast({ title: "Map Deleted", description: `${region?.name} offline map has been removed` });
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
          <CardTitle className="text-lg font-bold text-white flex justify-between">
            <span>Interactive Map</span>
            {isNavigating && <span className="text-green-400 text-sm animate-pulse">● Live Tracking</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative w-full h-[500px] rounded-xl overflow-hidden group">
            <div ref={mapContainerRef} className="w-full h-full bg-ios-darker" style={{ zIndex: 0 }} />

            {/* Navigation Overlay Controls */}
            {activeTab === 'navigation' && (
              <div className="absolute top-4 left-4 z-[400] bg-ios-card/90 backdrop-blur p-3 rounded-lg border border-gray-700 shadow-xl space-y-3 w-64">
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
                  <Button size="sm" variant="outline" className="w-full text-xs" onClick={handleCalculateRoute}>
                    Draw Line to Destination
                  </Button>
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
                navigator.geolocation.getCurrentPosition(p =>
                  mapInstanceRef.current?.flyTo([p.coords.latitude, p.coords.longitude], 15)
                )
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
                  <div key={p.id} className="bg-ios-darker p-3 rounded-lg flex justify-between items-center text-white">
                    <div>
                      <div className="font-semibold">{p.name}</div>
                      <div className="text-xs text-gray-400">{p.displayName}</div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => viewPlaceOnMap(p)}>View</Button>
                      <Button size="sm" variant="default" onClick={() => addPlaceAsRegion(p)}>Add</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Region List (Persisted from original) */}
      <Card className="bg-ios-card border-ios-gray">
        <CardHeader><CardTitle className="text-white">Downloaded Maps</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {mapRegions.filter(r => r.downloaded).length === 0 && <div className="text-gray-500 text-sm">No maps downloaded yet.</div>}
            {mapRegions.filter(r => r.downloaded).map(r => (
              <div key={r.id} className="flex justify-between items-center bg-ios-darker p-3 rounded-lg text-white">
                <span>{r.name}, {r.country}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-green-400">Ready</span>
                  <Button size="sm" variant="destructive" onClick={() => deleteMap(r.id)}><i className="fas fa-trash"></i></Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
