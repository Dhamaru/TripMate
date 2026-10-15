import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

interface EmergencyService {
  id: string;
  name: string;
  type: "hospital" | "police" | "embassy" | "fire" | "pharmacy";
  address: string;
  phone: string;
  distance: string;
  latitude: number | null;
  longitude: number | null;
}

interface EmergencyResponse {
  services: EmergencyService[];
  countryCode: string;
  sosNumbers: {
    police: string;
    medical: string;
    fire: string;
    common: string;
  };
}

interface EmergencyServicesProps {
  location?: string;
  coords?: { lat: number; lon: number } | null;
  className?: string;
}

export function EmergencyServices({
  location = "Current Location",
  coords: propCoords,
  className = "",
}: EmergencyServicesProps) {
  const { toast } = useToast();
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(propCoords || null);
  const [locString, setLocString] = useState<string>(location);

  // Sync prop coords to state if they change
  useEffect(() => {
    if (propCoords) setCoords(propCoords);
  }, [propCoords]);

  useEffect(() => {
    setLocString(location);
    // Resolving "Current Location" via navigator.geolocation used to happen
    // here too, concurrently with EmergencyPage's own locateMe() -- two
    // simultaneous geolocation prompts and two backend reverse-geocode
    // calls on every mount, with this copy's errors silently swallowed
    // (no message shown if permission was denied). The parent already owns
    // location resolution and passes it down via `coords`; this component
    // just reflects it.
    if (!propCoords && location !== "Current Location") {
      // If user typed a city manually, we don't have coords yet, reset coords so we don't hold onto old ones
      setCoords(null);
    }
  }, [location, propCoords]);

  // Exact coordinates whenever the page has them -- sending the short name
  // instead ("RR Peta") made the server re-geocode an ambiguous neighbourhood
  // and search around the wrong town. Rounded to 3 decimals (~110m) so live
  // tracking reuses the server's cache instead of 4 Places calls per move.
  const query = coords ? `${coords.lat.toFixed(3)},${coords.lon.toFixed(3)}` : locString;
  const { data, isLoading, error } = useQuery<EmergencyResponse>({
    queryKey: ["/api/v1/emergency", query],
    // "Current Location" is a placeholder, not a place -- searching it
    // literally returned nothing; wait for the parent to resolve coords.
    enabled: !!coords || (!!locString && !/^current location$/i.test(locString)),
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/v1/emergency/${encodeURIComponent(query)}`);
      const json = await res.json();
      if (Array.isArray(json)) {
        return {
          services: json,
          countryCode: "Unknown",
          sosNumbers: { police: "100", medical: "108", fire: "101", common: "112" },
        };
      }
      return json;
    },
    staleTime: 30_000,
  });

  const emergencyServices = data?.services || [];
  const sosNumbers = data?.sosNumbers || {
    police: "112",
    medical: "112",
    fire: "112",
    common: "112",
  };
  const countryCode = data?.countryCode || "Unknown";

  const servicesWithDistance = useMemo(() => {
    const calc = (lat1: number, lon1: number, lat2: number, lon2: number) => {
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
    if (!coords) return emergencyServices;
    return emergencyServices.map((s) => ({
      ...s,
      distance:
        s.latitude != null && s.longitude != null
          ? `${calc(coords.lat, coords.lon, s.latitude, s.longitude).toFixed(1)} km`
          : "",
    }));
  }, [coords, emergencyServices]);

  const serviceIcons: Record<EmergencyService["type"], { icon: string; color: string }> = {
    hospital: { icon: "fas fa-hospital", color: "text-red-500" },
    police: { icon: "fas fa-shield-alt", color: "text-[#1D4E89] dark:text-blue-400" },
    embassy: { icon: "fas fa-building", color: "text-[#163F73]" },
    fire: { icon: "fas fa-fire-extinguisher", color: "text-red-500" },
    pharmacy: { icon: "fas fa-pills", color: "text-emerald-500" },
  };

  // A laptop/desktop browser has nothing to dial with: tel: either opens a
  // linked-phone app or silently does nothing, so "Dialing..." was a lie
  // there. Tell the person the number to dial instead.
  const canDial = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  const dial = (number: string, label: string) => {
    toast({
      title: canDial ? `Calling ${label}` : `Call ${number} from your phone`,
      description: canDial
        ? `Dialing ${number}...`
        : `This device can't place calls. Dial ${number} for ${label}.`,
      variant: "destructive",
    });
    window.location.href = `tel:${number}`;
  };

  const handleSOSCall = () => dial(sosNumbers.common || "112", "local emergency");

  const handleShareLocation = async () => {
    const shareText = `Help! I need emergency assistance. My approximate location is ${locString}. Sent from TripMate.`;
    const shareUrl = coords ? `https://www.google.com/maps?q=${coords.lat},${coords.lon}` : "";

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Emergency Help Needed",
          text: shareText,
          url: shareUrl,
        });
        toast({ title: "Shared", description: "Location shared successfully" });
      } catch (err) {
        // Ignore abort
      }
    } else {
      // Fallback to WhatsApp
      const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText + " " + shareUrl)}`;
      window.open(whatsappUrl, "_blank");
    }
  };

  const handleCallService = (service: EmergencyService) => {
    // Google Places doesn't return phone numbers for most results — this
    // used to silently default to the country's police number, so tapping
    // "Call" on a hospital with no listed number actually called the
    // police. An empty number now shows the real limitation instead.
    if (!service.phone) {
      toast({
        title: "No phone number available",
        description: `${service.name} doesn't have a listed number. Try Directions instead.`,
        variant: "destructive",
      });
      return;
    }
    dial(service.phone.replace(/[^+\d]/g, ""), service.name);
  };

  const handleGetDirections = (service: EmergencyService) => {
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${service.latitude},${service.longitude}&travelmode=driving`;
    window.open(mapsUrl, "_blank");
    toast({
      title: "Directions Opened",
      description: `Getting directions to ${service.name}`,
    });
  };

  return (
    <Card className={`bg-card border ${className}`} data-testid="emergency-services">
      <CardHeader>
        <div className="flex flex-wrap justify-between items-center gap-2">
          <CardTitle className="text-lg font-bold text-foreground flex items-center flex-wrap gap-x-2 gap-y-1 min-w-0">
            <span className="flex items-center whitespace-nowrap">
              <i className="fas fa-shield-alt text-destructive mr-2"></i>
              Emergency Services
            </span>
            <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-normal whitespace-nowrap">
              {countryCode === "Unknown" ? "Searching..." : countryCode} Mode
            </span>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleShareLocation}
            className="text-[#1D4E89] dark:text-blue-400 hover:text-blue-600 flex-shrink-0"
          >
            <i className="fas fa-share-alt mr-1"></i> Share
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {/* Was the first result's own address ("near ring Near Siddhartha
              Medical College...") — the place searched, not a hospital. */}
          {locString && !/^current location$/i.test(locString)
            ? `Near ${locString}`
            : "Near your location"}
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Big Red SOS Button */}
        <Button
          onClick={handleSOSCall}
          className="w-full bg-[var(--stamp-red)] hover:bg-[var(--stamp-red-deep)] text-white font-bold py-6 text-xl border border-[var(--stamp-red-deep)] active:scale-95 transition-transform"
          data-testid="button-sos"
        >
          <i className="fas fa-phone-volume mr-3 text-2xl animate-pulse"></i>
          <div>
            <div>SOS EMERGENCY</div>
            <div className="text-xs font-normal opacity-80 mt-1">Dial {sosNumbers.common}</div>
          </div>
        </Button>

        <div className="space-y-3 mt-0">
          {isLoading && (
            <div className="text-center py-6 text-muted-foreground" data-testid="emergency-loading">
              Loading emergency data...
            </div>
          )}
          {!isLoading && servicesWithDistance.length === 0 && (
            <div className="text-center py-6 text-muted-foreground">No services found nearby.</div>
          )}
          {!isLoading &&
            servicesWithDistance.map((service, idx) => (
              <motion.div
                key={service.id}
                className="bg-muted/50 rounded-xl p-4 border"
                data-testid={`emergency-service-${service.id}`}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: idx * 0.05 }}
                viewport={{ once: true }}
              >
                {(() => {
                  // Live-crash found (2026-09-11): the nearby-search API proxies
                  // real OSM amenity types (clinic, dentist, veterinary, ...),
                  // not just this component's 5 known keys — an unrecognized
                  // type threw "Cannot read properties of undefined" and took
                  // down the whole page via the error boundary. Fall back to
                  // the hospital icon rather than assuming the API's type set
                  // matches this list exactly.
                  const icon = serviceIcons[service.type] ?? serviceIcons.hospital;
                  return (
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center space-x-3">
                        <div className={`text-xl ${icon.color} bg-muted p-2 rounded-lg`}>
                          <i className={icon.icon}></i>
                        </div>
                        <div>
                          <h3 className="font-medium text-foreground">{service.name}</h3>
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {service.address}
                          </p>
                          {service.distance && (
                            <p className="text-xs text-muted-foreground mt-1 flex items-center">
                              <i className="fas fa-map-marker-alt mr-1"></i> {service.distance}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-[#1D4E89] dark:text-blue-400 bg-[#1D4E89]/10 px-2 py-1 rounded">
                        {service.type.charAt(0).toUpperCase() + service.type.slice(1)}
                      </span>
                    </div>
                  );
                })()}

                <div className="flex space-x-2 mt-3 pt-2 border-t border">
                  <Button
                    onClick={() => handleCallService(service)}
                    size="sm"
                    className="flex-1 bg-green-600 hover:bg-green-700 h-8"
                  >
                    <i className="fas fa-phone mr-2 text-xs"></i> Call
                  </Button>
                  <Button
                    onClick={() => handleGetDirections(service)}
                    disabled={service.latitude == null || service.longitude == null}
                    size="sm"
                    variant="secondary"
                    className="flex-1 bg-muted hover:bg-muted/30 text-white h-8"
                  >
                    <i className="fas fa-location-arrow mr-2 text-xs"></i> Route
                  </Button>
                </div>
              </motion.div>
            ))}
        </div>

        {/* Local Numbers Reference */}
        <div className="bg-[#1D4E89]/10 rounded-xl p-4 border border-[#1D4E89]/20">
          <h4 className="font-medium text-[#1D4E89] dark:text-blue-400 mb-2 flex items-center text-sm">
            <i className="fas fa-info-circle mr-2"></i>
            Local Emergency Stats ({countryCode})
          </h4>
          <div className="grid grid-cols-3 gap-2 text-xs text-center">
            <div className="bg-muted p-2 rounded">
              <div className="text-muted-foreground mb-1">Police</div>
              <div className="font-bold text-foreground">{sosNumbers.police}</div>
            </div>
            <div className="bg-muted p-2 rounded">
              <div className="text-muted-foreground mb-1">Ambulance</div>
              <div className="font-bold text-foreground">{sosNumbers.medical}</div>
            </div>
            <div className="bg-muted p-2 rounded">
              <div className="text-muted-foreground mb-1">Fire</div>
              <div className="font-bold text-foreground">{sosNumbers.fire}</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
