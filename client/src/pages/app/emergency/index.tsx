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
      const res = await fetch(`/api/v1/geocode?query=${encodeURIComponent(q)}`);
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
        setCoords(null);
        setDisplayName("");
        setShortName("");
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
      setCoords(null);
      setDisplayName("");
      setShortName("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-ios-darker text-white">
      <div className="responsive-container py-8 max-w-4xl pt-header-gap">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
          <h1 className="text-4xl font-bold text-white mb-2">Emergency Services</h1>
          <p className="text-lg text-ios-gray">Locate nearby hospitals, police, and embassies</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="max-w-2xl mx-auto mb-6">
            <div className="flex space-x-2">
              <Input
                type="text"
                value={searchLocation}
                onChange={(e) => {
                  setSearchLocation(e.target.value);
                  setCoords(null); // Clear GPS coords when typing manually
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
                placeholder="Search location (e.g., Goa, Mumbai, Tokyo)"
                className="bg-ios-darker border-ios-gray text-white placeholder-ios-gray"
                data-testid="input-emergency-location"
              />
              <Button
                onClick={() => handleSearch()}
                className="bg-ios-blue hover:bg-blue-600 smooth-transition interactive-tap"
                data-testid="button-emergency-search"
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center">
                    <i className="fas fa-spinner animate-spin mr-2" />
                    Searching
                  </span>
                ) : (
                  "Search"
                )}
              </Button>
              <Button
                onClick={() => useMyLocation()}
                variant="outline"
                className="bg-ios-darker border-ios-gray hover:bg-ios-card text-white smooth-transition interactive-tap"
                title="Use my location"
                disabled={loading}
              >
                <i className="fas fa-location-arrow text-ios-blue" />
              </Button>
            </div>
            {message && <p className="text-red-400 mt-2 text-sm">{message}</p>}
          </div>
          <div className="text-center text-sm text-ios-gray mb-2">
            {loading ? "Searching…" : coords ? `Emergency services near ${displayName}` : message || "Search a location to find nearby emergency services"}
          </div>
          <EmergencyServices
            className="max-w-2xl mx-auto"
            coords={coords}
            location={
              shortName && shortName !== "Current location"
                ? shortName
                : displayName && displayName !== "Current location"
                  ? displayName
                  : "Current Location"
            }
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mt-4">
          <div className="text-center">
            <Link href="/app/features">
              <Button className="bg-gradient-to-r from-ios-blue to-purple-600 smooth-transition interactive-tap radius-md">
                Explore More Tools
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
