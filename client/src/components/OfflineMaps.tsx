import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface MapRegion {
  id: string;
  name: string;
  country: string;
  size: string; // e.g. "45 MB"
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
  source?: string;
  name_en?: string;
  name_local?: string;
  transliteration?: string;
  road?: string;
  city?: string;
  country?: string;
  postcode?: string;
}

interface OfflineMapsProps {
  className?: string;
}

const STORAGE_KEY = "tripmate_offlinemaps_v1";

const DEFAULT_REGIONS: MapRegion[] = [
  { id: "1", name: "Paris", country: "France", size: "45 MB", downloaded: true, downloading: false, progress: 100, lat: 48.8566, lng: 2.3522, zoom: 12 },
  { id: "2", name: "Tokyo", country: "Japan", size: "62 MB", downloaded: false, downloading: false, progress: 0, lat: 35.6762, lng: 139.6503, zoom: 12 },
  { id: "3", name: "New York City", country: "United States", size: "38 MB", downloaded: false, downloading: false, progress: 0, lat: 40.7128, lng: -74.0060, zoom: 12 },
  { id: "4", name: "London", country: "United Kingdom", size: "41 MB", downloaded: false, downloading: false, progress: 0, lat: 51.5074, lng: -0.1278, zoom: 12 },
  { id: "5", name: "Mumbai", country: "India", size: "52 MB", downloaded: false, downloading: false, progress: 0, lat: 19.0760, lng: 72.8777, zoom: 12 },
  { id: "6", name: "Sydney", country: "Australia", size: "48 MB", downloaded: false, downloading: false, progress: 0, lat: -33.8688, lng: 151.2093, zoom: 12 },
  { id: "7", name: "Dubai", country: "United Arab Emirates", size: "55 MB", downloaded: false, downloading: false, progress: 0, lat: 25.2048, lng: 55.2708, zoom: 12 },
  { id: "8", name: "Singapore", country: "Singapore", size: "35 MB", downloaded: false, downloading: false, progress: 0, lat: 1.3521, lng: 103.8198, zoom: 12 },
  { id: "9", name: "Rome", country: "Italy", size: "44 MB", downloaded: false, downloading: false, progress: 0, lat: 41.9028, lng: 12.4964, zoom: 12 },
  { id: "10", name: "Barcelona", country: "Spain", size: "42 MB", downloaded: false, downloading: false, progress: 0, lat: 41.3851, lng: 2.1734, zoom: 12 },
  { id: "11", name: "Bangkok", country: "Thailand", size: "50 MB", downloaded: false, downloading: false, progress: 0, lat: 13.7563, lng: 100.5018, zoom: 12 },
  { id: "12", name: "Istanbul", country: "Turkey", size: "47 MB", downloaded: false, downloading: false, progress: 0, lat: 41.0082, lng: 28.9784, zoom: 12 },
  { id: "13", name: "Los Angeles", country: "United States", size: "54 MB", downloaded: false, downloading: false, progress: 0, lat: 34.0522, lng: -118.2437, zoom: 12 },
  { id: "14", name: "Berlin", country: "Germany", size: "43 MB", downloaded: false, downloading: false, progress: 0, lat: 52.5200, lng: 13.4050, zoom: 12 },
  { id: "15", name: "Delhi", country: "India", size: "56 MB", downloaded: false, downloading: false, progress: 0, lat: 28.7041, lng: 77.1025, zoom: 12 },
];

export function OfflineMaps({ className = "" }: OfflineMapsProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRegion, setSelectedRegion] = useState<MapRegion | null>(null);
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
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const suggestTimerRef = useRef<number | null>(null);

  const { toast } = useToast();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const intervalsRef = useRef<Record<string, number>>({});
  const placesAbortRef = useRef<AbortController | null>(null);

  // Persist regions
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(mapRegions)); } catch { }
  }, [mapRegions]);

  // Initialize Leaflet
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
      iconUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
      shadowUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    });

    const map = L.map(mapContainerRef.current, { zoomControl: true }).setView([20, 0], 2);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      maxZoom: 18,
    }).addTo(map);

    mapInstanceRef.current = map;

    const downloadedRegion = mapRegions.find((r) => r.downloaded) ?? mapRegions[0];
    if (downloadedRegion) {
      map.setView([downloadedRegion.lat, downloadedRegion.lng], downloadedRegion.zoom);
      const marker = L.marker([downloadedRegion.lat, downloadedRegion.lng])
        .addTo(map)
        .bindPopup(
          `<b>${downloadedRegion.name}</b><br/>${downloadedRegion.country}<br/><small>${downloadedRegion.downloaded ? "Downloaded" : "Not Downloaded"
          }</small>`
        )
        .openPopup();
      markerRef.current = marker;
      setSelectedRegion(downloadedRegion);
    }

    // Auto-center on user location if available
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude, longitude } = pos.coords;
        if (mapInstanceRef.current) {
          mapInstanceRef.current.flyTo([latitude, longitude], 12);
        }
      }, (err) => console.log('Geolocation error', err));
    }

    return () => {
      Object.values(intervalsRef.current).forEach((id) => clearInterval(id));
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      markerRef.current = null;
      if (placesAbortRef.current) placesAbortRef.current.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function parsePlaceItem(it: any): PlaceResult | null {
    if (!it) return null;
    // Many geocoders return arrays of objects with lat/lon, display_name or name/state/country
    const lat = Number(it.lat ?? it.latitude ?? it.lat);
    const lon = Number(it.lon ?? it.longitude ?? it.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
    const enName = it.name_en ?? it.local_names?.en ?? it.name;
    const name = enName ?? it.display_name ?? it.title ?? (it.address && (it.address.city || it.address.town || it.address.village)) ?? `${lat},${lon}`;
    const displayName = it.display_name ?? (
      (enName || it.name) && ((enName || it.name) + (it.state ? `, ${it.state}` : "") + (it.country ? `, ${it.country}` : ""))
    ) ?? name;
    return {
      id: `${lat}-${lon}-${(it.osm_id ?? it.id ?? Math.random()).toString()}`,
      name: String(name),
      displayName: String(displayName),
      lat,
      lon,
      source: it.source ?? undefined,
      name_en: it.name_en ?? undefined,
      name_local: it.name_local ?? undefined,
      transliteration: it.transliteration ?? undefined,
      road: it.road ?? (it.address && (it.address.road || it.address.street)) ?? undefined,
      city: it.city ?? (it.address && (it.address.city || it.address.town || it.address.village)) ?? undefined,
      country: it.country ?? (it.address && it.address.country) ?? undefined,
      postcode: it.postcode ?? (it.address && it.address.postcode) ?? undefined,
    };
  }

  // Fetch places results from server endpoint
  async function fetchPlaces(query: string) {
    if (!query || query.trim().length < 2) {
      setPlacesResults([]); setTotal(0); setPage(1); return;
    }
    if (placesAbortRef.current) { placesAbortRef.current.abort(); placesAbortRef.current = null; }
    placesAbortRef.current = new AbortController();
    setPlacesLoading(true);
    setPlacesResults([]);
    try {
      const url = `/api/v1/places/search?q=${encodeURIComponent(query)}&page=${page}&pageSize=${pageSize}`;
      const res = await fetch(url, { signal: placesAbortRef.current.signal });
      const j = await res.json().catch(() => null);
      const arr = Array.isArray(j?.items) ? j.items : [];
      const parsed = arr.map(parsePlaceItem).filter(Boolean) as PlaceResult[];
      setPlacesResults(parsed);
      setTotal(Number(j?.total || parsed.length));
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        toast({ title: "Search failed", description: "Unable to fetch places." });
      }
    } finally {
      setPlacesLoading(false);
    }
  }

  // Fetch autocomplete suggestions
  async function fetchSuggestions(query: string) {
    if (!query || query.trim().length < 2) { setSuggestions([]); return; }
    try {
      const res = await fetch(`/api/v1/places/search?q=${encodeURIComponent(query)}&autocomplete=1`);
      const j = await res.json().catch(() => null);
      const arr = Array.isArray(j?.items) ? j.items : [];
      const parsed = arr.map(parsePlaceItem).filter(Boolean) as PlaceResult[];
      setSuggestions(parsed);
    } catch { }
  }

  function formatAddress(p: PlaceResult) {
    const parts = [p.road, p.city, p.country, p.postcode].filter(Boolean);
    return parts.join(', ');
  }

  function downloadBlob(content: string, mime: string, filename: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function toCSV(items: PlaceResult[]) {
    const header = ['name_en', 'name_local', 'transliteration', 'road', 'city', 'country', 'postcode', 'lat', 'lon'];
    const rows = items.map(i => [
      i.name_en ?? i.name ?? '', i.name_local ?? '', i.transliteration ?? '', i.road ?? '', i.city ?? '', i.country ?? '', i.postcode ?? '', i.lat, i.lon
    ]);
    const lines = [header.join(','), ...rows.map(r => r.map(v => typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : String(v)).join(','))];
    return lines.join('\n');
  }

  function toJSON(items: PlaceResult[]) {
    const mapped = items.map(i => ({
      name_en: i.name_en ?? i.name,
      name_local: i.name_local,
      transliteration: i.transliteration,
      road: i.road,
      city: i.city,
      country: i.country,
      postcode: i.postcode,
      lat: i.lat,
      lon: i.lon,
    }));
    return JSON.stringify(mapped, null, 2);
  }

  function toKML(items: PlaceResult[]) {
    const header = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document>`;
    const body = items.map(i => `\n  <Placemark>\n    <name>${(i.name_en ?? i.name ?? '').replace(/&/g, '&amp;')}</name>\n    <ExtendedData>\n      <Data name="road"><value>${(i.road ?? '').replace(/&/g, '&amp;')}</value></Data>\n      <Data name="city"><value>${(i.city ?? '').replace(/&/g, '&amp;')}</value></Data>\n      <Data name="country"><value>${(i.country ?? '').replace(/&/g, '&amp;')}</value></Data>\n      <Data name="postcode"><value>${(i.postcode ?? '').replace(/&/g, '&amp;')}</value></Data>\n    </ExtendedData>\n    <Point><coordinates>${i.lon},${i.lat},0</coordinates></Point>\n  </Placemark>`).join('');
    const footer = `\n</Document></kml>`;
    return header + body + footer;
  }

  function downloadItem(p: PlaceResult, format: 'json' | 'csv' | 'kml') {
    const items = [p];
    if (format === 'json') return downloadBlob(toJSON(items), 'application/json', 'location.json');
    if (format === 'csv') return downloadBlob(toCSV(items), 'text/csv', 'location.csv');
    return downloadBlob(toKML(items), 'application/vnd.google-earth.kml+xml', 'location.kml');
  }

  async function downloadAll(format: 'json' | 'csv' | 'kml') {
    try {
      const res = await fetch(`/api/v1/places/search?q=${encodeURIComponent(searchQuery)}&page=1&pageSize=50`);
      const j = await res.json().catch(() => null);
      const arr = Array.isArray(j?.items) ? j.items : [];
      const parsed = arr.map(parsePlaceItem).filter(Boolean) as PlaceResult[];
      if (format === 'json') return downloadBlob(toJSON(parsed), 'application/json', 'locations.json');
      if (format === 'csv') return downloadBlob(toCSV(parsed), 'text/csv', 'locations.csv');
      return downloadBlob(toKML(parsed), 'application/vnd.google-earth.kml+xml', 'locations.kml');
    } catch {
      toast({ title: 'Download failed', description: 'Unable to download locations.' });
    }
  }

  // Generate MapRegion from a place (estimate size randomly or based on zoom)
  function generateRegionFromPlace(p: PlaceResult): MapRegion {
    // size estimate: nearby cities small, countries large — use a simple heuristic
    const estimatedMB = Math.max(20, Math.round((Math.abs(p.lat) + Math.abs(p.lon)) % 60) + 30);
    const size = `${estimatedMB} MB`;
    const name = p.name.split(",")[0] ?? p.name;
    const zoom = 12;
    return {
      id: `place-${p.id}`,
      name,
      country: p.displayName.includes(",") ? p.displayName.split(",").slice(-1)[0].trim() : "",
      size,
      downloaded: false,
      downloading: false,
      progress: 0,
      lat: p.lat,
      lng: p.lon,
      zoom,
    };
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
    // do not change selectedRegion unless user adds the place
  }

  // Add a search result as a new MapRegion to the list (persisted)
  function addPlaceAsRegion(p: PlaceResult) {
    const region = generateRegionFromPlace(p);
    setMapRegions((prev) => {
      // avoid duplicates by lat/lng
      const exists = prev.find((r) => Math.abs(r.lat - region.lat) < 0.0001 && Math.abs(r.lng - region.lng) < 0.0001);
      if (exists) return prev;
      return [...prev, region];
    });
    toast({ title: "Map Added", description: `${region.name} has been added to your maps` });
  }

  // Utility: parse "45 MB" -> 45
  function parseSizeMB(size: string) {
    if (!size) return 0;
    const m = size.toString().match(/([\d,.]+)/);
    if (!m) return 0;
    return Math.round(Number(m[1].replace(",", "")));
  }

  // Stats
  const downloadedCount = mapRegions.filter((r) => r.downloaded).length;
  const totalSize = mapRegions.filter((r) => r.downloaded).reduce((s, r) => s + parseSizeMB(r.size), 0);

  // Download simulation (keeps original behavior)
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
    // update marker popup if needed
    if (selectedRegion?.id === regionId && mapInstanceRef.current) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = L.marker([selectedRegion.lat, selectedRegion.lng])
          .addTo(mapInstanceRef.current)
          .bindPopup(`<b>${selectedRegion.name}</b><br/>${selectedRegion.country}<br/><small>Not Downloaded</small>`)
          .openPopup();
      }
    }
  }

  // cleanup finished intervals
  useEffect(() => {
    Object.keys(intervalsRef.current).forEach((id) => {
      const region = mapRegions.find((r) => r.id === id);
      if (region && region.progress >= 100) {
        clearInterval(intervalsRef.current[id]);
        delete intervalsRef.current[id];
      }
    });
  }, [mapRegions]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      Object.values(intervalsRef.current).forEach((id) => clearInterval(id));
      if (placesAbortRef.current) { try { placesAbortRef.current.abort(); } catch { } }
    };
  }, []);

  // filtered existing regions
  const filteredRegions = mapRegions.filter((region) =>
    region.name.toLowerCase().includes(searchQuery.toLowerCase()) || region.country.toLowerCase().includes(searchQuery.toLowerCase())
  );


  const [currentLocationName, setCurrentLocationName] = useState<string | null>(null);

  const handleLocateUser = () => {
    if (!navigator.geolocation) {
      toast({ title: "Error", description: "Geolocation is not supported by your browser.", variant: "destructive" });
      return;
    }
    toast({ title: "Locating", description: "Finding your location..." });
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const map = mapInstanceRef.current;
        if (map) {
          map.flyTo([latitude, longitude], 14, { duration: 1.5 });

          // User Location Marker
          const userIcon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div style="background-color: #3b82f6; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.4);"></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          });

          // Remove potential existing user marker if needed
          if (markerRef.current) markerRef.current.remove();
          const marker = L.marker([latitude, longitude], { icon: userIcon }).addTo(map).bindPopup("You are here").openPopup();
          markerRef.current = marker;

          // Clear selected region immediately since we are at user location
          setSelectedRegion(null);

          // Reverse Geocode
          try {
            // Use Nominatim for reverse geocoding (OpenStreetMap)
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
            if (res.ok) {
              const data = await res.json();
              const name = data.display_name || data.name || "My Location";
              // Shorten name if too long
              const shortName = name.split(',').slice(0, 2).join(',');
              setCurrentLocationName(shortName);
            } else {
              setCurrentLocationName(`Lat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(4)}`);
            }
          } catch (e) {
            setCurrentLocationName("Current Location");
          }
        }
        toast({ title: "Located", description: "Map centered on your location." });
      },
      (err) => {
        console.error(err);
        toast({ title: "Error", description: "Unable to retrieve your location.", variant: "destructive" });
      },
      { enableHighAccuracy: true }
    );
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Map Display */}
      <Card className="bg-ios-card border-ios-gray" data-testid="offline-map-display">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-white flex items-center justify-between">
            <div className="flex items-center">
              <i className="fas fa-map text-ios-blue mr-2" aria-hidden />
              <span>Interactive Map View</span>
            </div>
            {(selectedRegion || currentLocationName) && (
              <span className="text-sm font-normal text-ios-gray" aria-live="polite">
                Viewing: {selectedRegion ? `${selectedRegion.name}, ${selectedRegion.country}` : currentLocationName}
              </span>
            )}
          </CardTitle>
          <p className="text-sm text-ios-gray">
            {downloadedCount} maps downloaded • {totalSize} MB used
          </p>
        </CardHeader>
        <CardContent>
          <div className="relative w-full h-96 rounded-xl overflow-hidden group">
            <div
              ref={mapContainerRef}
              className="w-full h-full bg-ios-darker"
              data-testid="map-container"
              style={{ zIndex: 0 }}
              role="region"
              aria-label="Map preview"
            />
            <Button
              onClick={handleLocateUser}
              variant="secondary"
              size="icon"
              className="absolute bottom-4 right-4 z-[400] bg-white text-black hover:bg-gray-200 shadow-lg border border-gray-300 rounded-full w-10 h-10 flex items-center justify-center transition-transform active:scale-95"
              aria-label="Center on my location"
              title="Locate Me"
            >
              <i className="fas fa-crosshairs text-lg"></i>
            </Button>
          </div>
          <p className="text-xs text-ios-gray mt-4 text-center">
            <i className="fas fa-info-circle mr-1" aria-hidden />
            Click on a city below to view its location on the map
          </p>
        </CardContent>
      </Card>

      {/* Download Manager + Search Results */}
      <Card className="bg-ios-card border-ios-gray relative z-10" data-testid="offline-map-manager">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-white">Download Maps</CardTitle>
          <div className="flex gap-2 items-center">
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                const v = e.target.value;
                setSearchQuery(v);
                if (suggestTimerRef.current) { clearTimeout(suggestTimerRef.current); suggestTimerRef.current = null; }
                suggestTimerRef.current = window.setTimeout(() => fetchSuggestions(v), 250);
              }}
              placeholder="Search for a city or country..."
              className="bg-ios-darker border-ios-gray text-white placeholder-ios-gray"
              data-testid="input-search-maps"
              aria-label="Search maps"
            />
            <Button type="button" onClick={() => { setPage(1); fetchPlaces(searchQuery); }} size="sm" className="bg-ios-blue" aria-label="Search places">
              {placesLoading ? <i className="fas fa-spinner fa-spin" /> : "Search"}
            </Button>
          </div>
          {suggestions.length > 0 && (
            <div className="mt-2 bg-ios-card border border-ios-gray rounded-md shadow-lg w-full">
              {suggestions.map((s) => (
                <div key={s.id} className="px-3 py-2 text-sm text-white hover:bg-ios-darker cursor-pointer" onClick={() => { setSearchQuery(s.displayName || s.name); setSuggestions([]); setPage(1); fetchPlaces(s.displayName || s.name); }}>
                  {s.name}
                  <span className="text-xs text-ios-gray ml-2">{s.city ? `${s.city}, ` : ""}{s.country}</span>
                </div>
              ))}
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Pagination + Bulk download */}
          {placesResults.length > 0 && (
            <div className="flex items-center justify-between">
              <div className="text-xs text-ios-gray">Results: {total} • Page {page}</div>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => { const pg = Math.max(1, page - 1); setPage(pg); fetchPlaces(searchQuery); }} aria-label="Previous page">Prev</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => { const pg = page + 1; setPage(pg); fetchPlaces(searchQuery); }} aria-label="Next page">Next</Button>
                <Button type="button" size="sm" onClick={() => downloadAll('json')} aria-label="Download all JSON">JSON</Button>
                <Button type="button" size="sm" onClick={() => downloadAll('csv')} aria-label="Download all CSV">CSV</Button>
                <Button type="button" size="sm" onClick={() => downloadAll('kml')} aria-label="Download all KML">KML</Button>
              </div>
            </div>
          )}

          {/* Places search results */}
          {placesResults.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm text-ios-gray">Search results</div>
              <div className="grid gap-2">
                {placesResults.map((p) => (
                  <div key={p.id} className="bg-ios-darker rounded-xl p-3 flex items-center justify-between">
                    <div className="flex-1 pr-3">
                      <div className="text-white font-medium">{p.name_en ?? p.name}</div>
                      <div className="text-xs text-ios-gray">{formatAddress(p)}</div>
                      <div className="text-xs text-ios-gray">{p.lat.toFixed(6)}, {p.lon.toFixed(6)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => viewPlaceOnMap(p)} aria-label={`View ${p.name} on map`}>
                        View
                      </Button>
                      <Button type="button" size="sm" onClick={() => addPlaceAsRegion(p)} aria-label={`Add ${p.name} to maps`}>
                        Add Map
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => downloadItem(p, 'json')} aria-label={`Download ${p.name} JSON`}>JSON</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => downloadItem(p, 'csv')} aria-label={`Download ${p.name} CSV`}>CSV</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => downloadItem(p, 'kml')} aria-label={`Download ${p.name} KML`}>KML</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Existing regions */}
          {filteredRegions.map((region) => (
            <div
              key={region.id}
              className={`bg-ios-darker rounded-xl p-4 cursor-pointer transition-all ${selectedRegion?.id === region.id ? "ring-2 ring-ios-blue" : "hover:bg-ios-card"}`}
              onClick={() => {
                setSelectedRegion(region);
                const map = mapInstanceRef.current;
                if (map) {
                  map.flyTo([region.lat, region.lng], region.zoom, { duration: 1.2 });
                  if (markerRef.current) { markerRef.current.remove(); markerRef.current = null; }
                  const mk = L.marker([region.lat, region.lng])
                    .addTo(map)
                    .bindPopup(`<b>${region.name}</b><br/>${region.country}<br/><small>${region.downloaded ? "Downloaded" : "Not Downloaded"}</small>`)
                    .openPopup();
                  markerRef.current = mk;
                }
              }}
              data-testid={`map-region-${region.id}`}
              role="button"
              aria-pressed={selectedRegion?.id === region.id}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center">
                    <h3 className="font-medium text-white mr-2">{region.name}</h3>
                    {selectedRegion?.id === region.id && (
                      <span className="text-xs text-ios-blue"><i className="fas fa-eye mr-1" aria-hidden />Viewing</span>
                    )}
                  </div>
                  <p className="text-sm text-ios-gray">{region.country} • {region.size}</p>
                </div>

                <div className="flex items-center space-x-2">
                  {region.downloaded && (
                    <span className="text-xs text-ios-green bg-ios-green/20 px-2 py-1 rounded-full">
                      <i className="fas fa-check mr-1" aria-hidden />Downloaded
                    </span>
                  )}

                  {region.downloading ? (
                    <Button size="sm" disabled className="bg-ios-gray cursor-not-allowed" type="button" aria-label={`Downloading ${region.name}`}>
                      <i className="fas fa-spinner fa-spin mr-1" aria-hidden />Downloading
                    </Button>
                  ) : region.downloaded ? (
                    <div className="flex space-x-1">
                      <Button onClick={(e) => { e.stopPropagation(); deleteMap(region.id); }} size="sm" variant="outline" className="bg-ios-darker border-ios-red text-ios-red hover:bg-ios-red hover:text-white" type="button" aria-label={`Delete ${region.name}`}>
                        <i className="fas fa-trash text-xs" aria-hidden />
                      </Button>
                    </div>
                  ) : (
                    <Button onClick={(e) => { e.stopPropagation(); downloadMap(region.id); }} size="sm" className="bg-ios-blue" type="button" aria-label={`Download ${region.name}`}>
                      <i className="fas fa-download mr-1" aria-hidden />Download
                    </Button>
                  )}
                </div>
              </div>

              {region.downloading && (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-ios-gray">Downloading...</span>
                    <span className="text-xs text-ios-gray">{Math.round(region.progress)}%</span>
                  </div>
                  <Progress value={region.progress} className="h-2" data-testid={`progress-download-${region.id}`} />
                </div>
              )}
            </div>
          ))}

          {filteredRegions.length === 0 && placesResults.length === 0 && (
            <div className="text-center py-8">
              <div className="text-ios-gray mb-4"><i className="fas fa-search text-4xl" aria-hidden /></div>
              <p className="text-ios-gray text-sm">No maps found</p>
              <p className="text-ios-gray text-xs">Try searching for a different location or use the search above to add new places</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Storage Info */}
      <Card className="bg-ios-card border-ios-gray" data-testid="storage-info">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-white">Storage Used</h3>
              <p className="text-sm text-ios-gray">{totalSize} MB of offline maps</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-ios-blue">{downloadedCount}</p>
              <p className="text-xs text-ios-gray">Maps Available</p>
            </div>
          </div>

          <div className="mt-4 text-center">
            <p className="text-xs text-ios-gray"><i className="fas fa-info-circle mr-1" aria-hidden />Downloaded maps work without internet connection for navigation</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
