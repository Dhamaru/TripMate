import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { Link, useLocation } from "wouter";
import { WeatherWidget } from "@/components/WeatherWidget";

export default function WeatherPage() {
  const { user } = useAuth() as { user: any };
  const [, navigate] = useLocation();

  const [location, setLocation] = useState<string>(""); // resolved location label used by widget when coords empty
  const [searchLocation, setSearchLocation] = useState<string>(""); // input value
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [displayName, setDisplayName] = useState<string>(""); // human label shown in UI
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  const [suggestions, setSuggestions] = useState<Array<{ name: string; lat: number; lon: number }>>([]);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    // Auto-load user's location weather on mount
    useMyLocation();

    return () => { mountedRef.current = false; if (debounceRef.current) window.clearTimeout(debounceRef.current); if (abortRef.current) abortRef.current.abort(); };
  }, []);

  function parseGeocodeResponse(json: any) {
    if (!json) return null;
    // OpenWeatherMap direct geocoding: array with { name, lat, lon, country, state? }
    if (Array.isArray(json) && json.length > 0) {
      const first = json[0];
      const lat = Number(first.lat ?? first.latitude ?? first.lat);
      const lon = Number(first.lon ?? first.longitude ?? first.lon);
      return {
        lat,
        lon,
        displayName:
          (first.name ? `${first.name}${first.state ? ", " + first.state : ""}${first.country ? ", " + first.country : ""}` : null) ||
          first.display_name ||
          `${lat},${lon}`,
      };
    }
    // Nominatim / reverse geocode object
    if (typeof json === "object" && (json.lat || json.lon || json.address || json.display_name)) {
      const lat = Number(json.lat ?? json.latitude ?? json.location?.lat);
      const lon = Number(json.lon ?? json.longitude ?? json.location?.lon);
      return {
        lat,
        lon,
        displayName:
          json.display_name ??
          (json.address && (json.address.city || json.address.town || json.address.village || json.address.state)) ??
          (json.name ?? ""),
      };
    }
    // Custom shape { lat, lon, displayName }
    if (typeof json === "object" && (json.lat !== undefined || json.lon !== undefined)) {
      return {
        lat: Number(json.lat),
        lon: Number(json.lon),
        displayName: String(json.displayName ?? json.name ?? ""),
      };
    }
    return null;
  }

  async function geocodeQuery(q: string) {
    if (!q) return null;
    try {
      const res = await fetch(`/api/v1/geocode?query=${encodeURIComponent(q)}`);
      const json = await res.json().catch(() => null);
      const parsed = parseGeocodeResponse(json);
      return parsed;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    // cleanup any running fetch
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    const q = searchLocation.trim();
    if (!q || q.length < 3) { setSuggestions([]); setActiveIndex(-1); return; }

    abortRef.current = new AbortController();
    debounceRef.current = window.setTimeout(async () => {
      try {
        const signal = abortRef.current?.signal;
        const res = await fetch(`/api/v1/geocode?query=${encodeURIComponent(q)}`, { signal });
        if (!mountedRef.current) return;
        const j = await res.json().catch(() => null);
        let arr: Array<any> = [];
        if (Array.isArray(j)) arr = j;
        else if (Array.isArray(j?.results)) arr = j.results;
        const mapped = arr.slice(0, 5).map((it: any) => ({
          name: it.name ? `${it.name}${it.state ? ", " + it.state : ""}${it.country ? ", " + it.country : ""}` : (it.display_name || ""),
          lat: Number(it.lat ?? it.latitude ?? it.latitude ?? it.lat),
          lon: Number(it.lon ?? it.longitude ?? it.longitude ?? it.lon),
        })).filter((s) => s.name && !Number.isNaN(s.lat) && !Number.isNaN(s.lon));
        setSuggestions(mapped);
        setActiveIndex(-1);
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        setSuggestions([]);
        setActiveIndex(-1);
      }
    }, 300);

    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; } };
  }, [searchLocation]);

  async function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setMessage("Geolocation not supported.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("Geolocation timed out")), 10000);
        navigator.geolocation.getCurrentPosition(
          (p) => { clearTimeout(t); resolve(p); },
          (err) => { clearTimeout(t); reject(err); },
          { enableHighAccuracy: false, timeout: 10000 }
        );
      });

      if (!mountedRef.current) return;
      const lat = Number(pos.coords.latitude.toFixed(5));
      const lon = Number(pos.coords.longitude.toFixed(5));

      // Attempt reverse geocode via server endpoint
      try {
        const r = await fetch(`/api/v1/reverse-geocode?lat=${lat}&lon=${lon}`);
        const j = await r.json().catch(() => null);
        const parsed = parseGeocodeResponse(j);
        if (parsed && !Number.isNaN(parsed.lat) && !Number.isNaN(parsed.lon)) {
          setCoords({ lat: parsed.lat, lon: parsed.lon });
          const name = parsed.displayName || "Current Location";
          setDisplayName(name);
          setLocation(name);
          setSearchLocation(name);
        } else {
          setCoords({ lat, lon });
          setDisplayName("Current Location");
          setLocation("Current Location");
          setSearchLocation(""); // Clear search to show placeholder or location
        }
      } catch {
        if (!mountedRef.current) return;
        setCoords({ lat, lon });
        setDisplayName("Current Location");
        setLocation("Current Location");
        setSearchLocation("");
      }
    } catch (err: any) {
      if (!mountedRef.current) return;
      setMessage(err?.message ?? "Failed to get current location.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  async function handleSearch(q?: string) {
    const query = (q ?? searchLocation).trim();
    if (!query) {
      setMessage("Please enter a location.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const parsed = await geocodeQuery(query);
      if (!parsed || Number.isNaN(parsed.lat) || Number.isNaN(parsed.lon)) {
        setMessage("Location not found");
        setCoords(null);
        setDisplayName("");
        setLocation("");
        setLoading(false);
        return;
      }
      setCoords({ lat: parsed.lat, lon: parsed.lon });
      setDisplayName(parsed.displayName ?? query);
      setLocation(parsed.displayName ?? query);
      setSearchLocation(parsed.displayName ?? query);
      setSuggestions([]);
      setMessage("");
    } catch {
      setMessage("Location not found");
      setCoords(null);
      setDisplayName("");
      setLocation("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-ios-darker text-white">


      {/* Main Content */}
      <div className="responsive-container py-4 max-w-4xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Weather Insights</h1>
          <p className="text-lg text-ios-gray">7-day forecasts and travel weather recommendations</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="max-w-2xl mx-auto mb-6">
            <div className="flex space-x-2">
              <Input
                aria-label="Search location"
                type="text"
                value={searchLocation}
                onChange={(e) => setSearchLocation(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (activeIndex >= 0 && suggestions[activeIndex]) {
                      const s = suggestions[activeIndex];
                      setCoords({ lat: s.lat, lon: s.lon });
                      setDisplayName(s.name);
                      setLocation(s.name);
                      setSearchLocation(s.name);
                      setSuggestions([]);
                    } else {
                      handleSearch();
                    }
                  }
                  if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, Math.max(0, suggestions.length - 1))); }
                  if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, -1)); }
                }}
                placeholder="Search location (e.g., Goa, Tokyo)"
                className="bg-ios-darker border-ios-gray text-white placeholder-ios-gray"
                data-testid="input-weather-location"
              />
              <Button type="button" onClick={() => handleSearch()} className="bg-ios-blue hover:bg-blue-600 smooth-transition interactive-tap" data-testid="button-weather-search" disabled={loading}>
                {loading ? (
                  <span className="flex items-center">
                    <i className="fas fa-spinner animate-spin mr-2" />
                    Searching
                  </span>
                ) : "Search"}
              </Button>

              <Button type="button" variant="outline" onClick={() => useMyLocation()} className="bg-ios-darker border-ios-gray text-white hover:bg-ios-card smooth-transition interactive-tap">
                Use My Location
              </Button>
            </div>

            {suggestions.length > 0 && (
              <div role="listbox" aria-label="Location suggestions" className="mt-2 bg-ios-darker border border-ios-gray rounded-md">
                {suggestions.map((s, idx) => (
                  <button
                    key={`${s.name}-${idx}`}
                    role="option"
                    aria-selected={activeIndex === idx}
                    className={`w-full text-left px-3 py-2 text-sm ${activeIndex === idx ? 'bg-ios-card' : ''}`}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => {
                      setCoords({ lat: s.lat, lon: s.lon });
                      setDisplayName(s.name);
                      setLocation(s.name);
                      setSearchLocation(s.name);
                      setSuggestions([]);
                    }}
                    type="button"
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="text-center text-sm text-ios-gray mb-2" role="status" aria-live="polite">
            {loading ? "Searching…" : coords ? `Showing weather for ${displayName}` : message || (location ? `Showing weather for ${location}` : "Search a location to view weather")}
          </div>

          <WeatherWidget location={coords ? undefined : location} coords={coords} className="max-w-2xl mx-auto" />
        </motion.div>

        {/* Radar Map Removed as per user request */}

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mt-8">
          <div className="text-center">
            <Link href="/app/features">
              <Button type="button" className="bg-gradient-to-r from-ios-blue to-purple-600 smooth-transition interactive-tap radius-md">Explore More Tools</Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
