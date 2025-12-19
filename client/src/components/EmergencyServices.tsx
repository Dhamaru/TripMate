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
  type: 'hospital' | 'police' | 'embassy' | 'fire' | 'pharmacy';
  address: string;
  phone: string;
  distance: string;
  latitude: number;
  longitude: number;
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
  className?: string;
}

export function EmergencyServices({ location = "Current Location", className = '' }: EmergencyServicesProps) {
  const { toast } = useToast();
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locString, setLocString] = useState<string>(location);


  useEffect(() => {
    setLocString(location);
    if (location === "Current Location" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          setCoords({ lat: latitude, lon: longitude });

          // Reverse Geocode to get readable name
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
            const data = await res.json();
            const addr = data.address;
            // distinct name: City > Town > Village > County
            const placeName = addr.city || addr.town || addr.village || addr.county || addr.suburb;
            const state = addr.state || addr.country;
            if (placeName) {
              const readableName = `${placeName}${state ? `, ${state}` : ''}`;
              setLocString(readableName);
              // Update the search input via prop update or state sync if possible?
              // Actually, component uses 'location' prop as initial value for input.
              // But input is driven by locString in the useEffect logic? No, input is via parent?
              // Wait, EmergencyServices doesn't have an input inside it?
              // The screenshot shows a Search input. It must be in EmergencyServices or parent.
              // Ah, looking at the code, it's NOT in EmergencyServices!
              // EmergencyServices takes 'location' prop.
              // The search bar is likely in the PARENT component (EmergencyPage).
              // I need to check the parent.
            }
          } catch (err) {
            console.error("Reverse geocoding failed", err);
          }
        },
        (err) => console.error("Geo error", err)
      );
    } else {
      setCoords(null);
    }
  }, [location]);

  const { data, isLoading, error } = useQuery<EmergencyResponse>({
    queryKey: ['/api/v1/emergency', locString, coords],
    enabled: !!locString,
    queryFn: async ({ queryKey }) => {
      const [, loc, c] = queryKey as [string, string, { lat: number; lon: number } | null];
      // FIX: Prioritize the NAME (loc) for manual searches (e.g. "Paris") because the backend 
      // handles "hospital near Paris" better than "hospital near 48.85,2.35".
      // Only use coordinates if the location is generic "Current location" to ensure precision.
      const isCurrentLocation = loc === "Current location" || !loc;
      const query = (isCurrentLocation && c) ? `${c.lat},${c.lon}` : loc;

      const res = await apiRequest('GET', `/api/v1/emergency/${encodeURIComponent(query)}`);
      // Validate response structure (old API returned array, new returns object)
      const json = await res.json();
      if (Array.isArray(json)) {
        // Fallback for old API if cached or reverting
        return { services: json, countryCode: 'Unknown', sosNumbers: { police: '100', medical: '108', fire: '101', common: '112' } };
      }
      return json;
    },
    staleTime: 30_000,
  });

  const emergencyServices = data?.services || [];
  const sosNumbers = data?.sosNumbers || { police: '112', medical: '112', fire: '112', common: '112' };
  const countryCode = data?.countryCode || 'Unknown';

  const servicesWithDistance = useMemo(() => {
    const calc = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };
    if (!coords) return emergencyServices;
    return emergencyServices.map(s => ({ ...s, distance: `${calc(coords.lat, coords.lon, s.latitude, s.longitude).toFixed(1)} km` }));
  }, [coords, emergencyServices]);

  const serviceIcons: Record<EmergencyService['type'], { icon: string; color: string }> = {
    hospital: { icon: 'fas fa-hospital', color: 'text-ios-red' },
    police: { icon: 'fas fa-shield-alt', color: 'text-ios-blue' },
    embassy: { icon: 'fas fa-building', color: 'text-ios-orange' },
    fire: { icon: 'fas fa-fire-extinguisher', color: 'text-ios-red' },
    pharmacy: { icon: 'fas fa-pills', color: 'text-ios-green' },
  };

  const handleSOSCall = () => {
    const sosNumber = sosNumbers.common || '112';
    toast({
      title: "SOS Call Initiated",
      description: `Dialing local emergency (${sosNumber})...`,
      variant: "destructive",
    });
    window.location.href = `tel:${sosNumber}`;
  };

  const handleShareLocation = async () => {
    const shareText = `Help! I need emergency assistance. My approximate location is ${locString}. Sent from TripMate.`;
    const shareUrl = coords ? `https://www.google.com/maps?q=${coords.lat},${coords.lon}` : '';

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Emergency Help Needed',
          text: shareText,
          url: shareUrl
        });
        toast({ title: "Shared", description: "Location shared successfully" });
      } catch (err) {
        // Ignore abort
      }
    } else {
      // Fallback to WhatsApp
      const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText + " " + shareUrl)}`;
      window.open(whatsappUrl, '_blank');
    }
  };

  const handleCallService = (service: EmergencyService) => {
    toast({
      title: "Calling Service",
      description: `Calling ${service.name}...`,
    });
    const sanitized = service.phone.replace(/[^+\d]/g, '');
    window.location.href = `tel:${sanitized}`;
  };

  const handleGetDirections = (service: EmergencyService) => {
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${service.latitude},${service.longitude}&travelmode=driving`;
    window.open(mapsUrl, '_blank');
    toast({
      title: "Directions Opened",
      description: `Getting directions to ${service.name}`,
    });
  };

  return (
    <Card className={`bg-ios-card border-ios-gray ${className}`} data-testid="emergency-services">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg font-bold text-white flex items-center">
            <i className="fas fa-shield-alt text-ios-red mr-2"></i>
            Emergency Services
            <span className="ml-2 text-xs bg-ios-gray/20 text-ios-gray px-2 py-0.5 rounded-full font-normal">{countryCode === 'Unknown' ? 'Searching...' : countryCode} Mode</span>
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={handleShareLocation} className="text-ios-blue hover:text-blue-400">
            <i className="fas fa-share-alt mr-1"></i> Share
          </Button>
        </div>
        <p className="text-sm text-ios-gray">
          {(emergencyServices.length > 0 && emergencyServices[0]?.address)
            ? `Emergency services near ${emergencyServices[0].address}`
            : (coords ? "Near your location" : `Near ${locString}`)}
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Big Red SOS Button */}
        <Button
          onClick={handleSOSCall}
          className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold py-6 text-xl shadow-lg shadow-red-900/20 active:scale-95 transition-transform"
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
            <div className="text-center py-6 text-ios-gray" data-testid="emergency-loading">Loading emergency data...</div>
          )}
          {!isLoading && servicesWithDistance.length === 0 && (
            <div className="text-center py-6 text-ios-gray">No services found nearby.</div>
          )}
          {!isLoading && servicesWithDistance.map((service, idx) => (
            <motion.div
              key={service.id}
              className="bg-ios-darker rounded-xl p-4 border border-ios-gray/20"
              data-testid={`emergency-service-${service.id}`}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: idx * 0.05 }}
              viewport={{ once: true }}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center space-x-3">
                  <div className={`text-xl ${serviceIcons[service.type].color} bg-white/5 p-2 rounded-lg`}>
                    <i className={serviceIcons[service.type].icon}></i>
                  </div>
                  <div>
                    <h3 className="font-medium text-white">{service.name}</h3>
                    <p className="text-sm text-ios-gray line-clamp-1">{service.address}</p>
                    <p className="text-xs text-ios-gray mt-1 flex items-center">
                      <i className="fas fa-map-marker-alt mr-1"></i> {service.distance}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-ios-blue bg-ios-blue/10 px-2 py-1 rounded">
                  {service.type.charAt(0).toUpperCase() + service.type.slice(1)}
                </span>
              </div>

              <div className="flex space-x-2 mt-3 pt-2 border-t border-white/5">
                <Button
                  onClick={() => handleCallService(service)}
                  size="sm"
                  className="flex-1 bg-green-600 hover:bg-green-700 h-8"
                >
                  <i className="fas fa-phone mr-2 text-xs"></i> Call
                </Button>
                <Button
                  onClick={() => handleGetDirections(service)}
                  size="sm"
                  variant="secondary"
                  className="flex-1 bg-ios-gray/20 hover:bg-ios-gray/30 text-white h-8"
                >
                  <i className="fas fa-location-arrow mr-2 text-xs"></i> Route
                </Button>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Local Numbers Reference */}
        <div className="bg-ios-blue/10 rounded-xl p-4 border border-ios-blue/20">
          <h4 className="font-medium text-ios-blue mb-2 flex items-center text-sm">
            <i className="fas fa-info-circle mr-2"></i>
            Local Emergency Stats ({countryCode})
          </h4>
          <div className="grid grid-cols-3 gap-2 text-xs text-center">
            <div className="bg-ios-darker p-2 rounded">
              <div className="text-ios-gray mb-1">Police</div>
              <div className="font-bold text-white">{sosNumbers.police}</div>
            </div>
            <div className="bg-ios-darker p-2 rounded">
              <div className="text-ios-gray mb-1">Ambulance</div>
              <div className="font-bold text-white">{sosNumbers.medical}</div>
            </div>
            <div className="bg-ios-darker p-2 rounded">
              <div className="text-ios-gray mb-1">Fire</div>
              <div className="font-bold text-white">{sosNumbers.fire}</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
