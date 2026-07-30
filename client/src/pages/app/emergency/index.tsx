import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmergencyServices } from "@/components/EmergencyServices";
import { useAuth } from "@/hooks/useAuth";
import { useLocation, Link } from "wouter";

export default function EmergencyPage() {
  const { user } = useAuth() as { user: any };
  const [, navigate] = useLocation();

  const [searchLocation, setSearchLocation] = useState<string>("");
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [displayName, setDisplayName] = useState<string>("");
  const [shortName, setShortName] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    useMyLocation();
  }, []);

  // helper to parse geocode response (supports array or single object)
  function parseGeocodeResponse(json: any) {
    if (!json) return null;
    let shortName = "";
    if (Array.isArray(json) && json.length > 0) {
      const first = json[0];
      shortName = first.name ?? first.locality ?? first.city ?? first.town ?? first.village ?? "";
      return {
        lat: Number(first.lat ?? first.latitude ?? first.lat),
        lon: Number(first.lon ?? first.longitude ?? first.lon),
        displayName:
          first.display_name ?? first.name ?? [first.locality, first.state, first.country]
            .filter(Boolean)
            .join(", "),
        shortName: shortName || first.name || "",
      };
    }
    if (typeof json === "object" && (json.lat || json.lat === 0 || json.latitude || json.lon || json.longitude)) {
      shortName = json.name ?? json.city ?? json.town ?? "";
      return {
        lat: Number(json.lat ?? json.latitude),
        lon: Number(json.lon ?? json.longitude),
        displayName: String(json.display_name ?? json.name ?? json.address ?? ""),
        shortName: shortName || String(json.name || ""),
      };
    }
    return null;
  }

  async function geocodeQuery(q: string) {
    if (!q) return null;
    try {
      const res = await fetch(`/api/v1/geocode?q=${encodeURIComponent(q)}`);
      const json = await res.json().catch(() => null);
      return parseGeocodeResponse(json);
    } catch {
      return null;
    }
  }

  async function useMyLocation() {
    if (!navigator.geolocation) {
      setMessage("Geolocation not supported in this browser.");
      return;
    }
    setMessage("");
    setLoading(true);
    try {
      await new Promise<void>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            try {
              const r = await fetch(`/api/v1/reverse-geocode?lat=${latitude}&lon=${longitude}`);
              const j = await r.json().catch(() => null);
              const parsed = parseGeocodeResponse(j) ?? {
                lat: latitude,
                lon: longitude,
                displayName: "Current location",
                shortName: "Current location",
              };
              setCoords({ lat: parsed.lat, lon: parsed.lon });
              setDisplayName(parsed.displayName ?? "Current location");
              setShortName(parsed.shortName ?? "Current location");
              setSearchLocation(parsed.displayName ?? "");
            } catch {
              setCoords({ lat: Number(latitude), lon: Number(longitude) });
              // Fallback: don't show specific lat/lon in search bar to avoid confusion
              setDisplayName("Current location");
              setShortName("Current location");
              setSearchLocation("Current location");
            } finally {
              resolve();
            }
          },
          (error) => reject(error),
          { enableHighAccuracy: false, timeout: 10000 }
        );
      });
    } catch (err: any) {
      setMessage(err?.message ?? "Failed to get current location.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(q?: string) {
    const query = (q ?? searchLocation).trim();
    if (!query) {
      setMessage("Please enter a location to search.");
      return;
    }
    setMessage("");
    setLoading(true);
    try {
      const parsed = await geocodeQuery(query);
      if (!parsed || Number.isNaN(parsed.lat) || Number.isNaN(parsed.lon)) {
        // Keep any already-known-good location intact — don't wipe a working
        // result just because a re-search of the same (often overly specific)
        // address failed to forward-geocode.
        setMessage("Location not found");
        return;
      }
      setCoords({ lat: parsed.lat, lon: parsed.lon });
      setDisplayName(parsed.displayName ?? query);
      setShortName(parsed.shortName ?? query);
      setSearchLocation(parsed.displayName ?? query);
      setMessage("");
    } catch {
      setMessage("Location not found");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Emergency Services</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Locate nearby hospitals, police, and embassies</p>
      </div>

      <div className="bg-card rounded-2xl border border p-4 max-w-2xl">
        <div className="flex gap-2">
          <Input
            type="text"
            value={searchLocation}
            onChange={(e) => setSearchLocation(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            placeholder="Search location (e.g., Goa, Mumbai, Tokyo)"
            className="bg-muted border text-foreground placeholder:text-muted-foreground focus-visible:ring-[#163F73]/30"
            data-testid="input-emergency-location"
          />
          <Button onClick={() => handleSearch()} className="bg-[#163F73] hover:bg-[#0F2C52] text-white" data-testid="button-emergency-search" disabled={loading}>
            {loading ? <span className="flex items-center gap-1"><i className="fas fa-spinner animate-spin" />Searching</span> : "Search"}
          </Button>
          <Button onClick={() => useMyLocation()} variant="outline" className="border text-foreground hover:bg-muted" title="Use my location" disabled={loading}>
            <i className="fas fa-location-arrow text-[#163F73]" />
          </Button>
        </div>
        {message && <p className="text-red-500 mt-2 text-sm">{message}</p>}
        <div className="text-sm text-muted-foreground mt-2">
          {loading ? "Searching…" : coords ? `Emergency services near ${displayName}` : "Search a location to find nearby emergency services"}
        </div>
      </div>

      <EmergencyServices
        className="max-w-2xl"
        coords={coords}
        location={
          shortName && shortName !== "Current location"
            ? shortName
            : displayName && displayName !== "Current location"
              ? displayName
              : "Current Location"
        }
      />
    </div>
  );
}
