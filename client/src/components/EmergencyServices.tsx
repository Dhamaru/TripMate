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

interface EmergencyServicesProps {
  location?: string;
  className?: string;
}

export function EmergencyServices({ location = "Current Location", className = '' }: EmergencyServicesProps) {
  const { toast } = useToast();
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locString, setLocString] = useState<string>(location);
  const [geoError, setGeoError] = useState<string>("");

  useEffect(() => {
    setLocString(location);
  }, [location]);

  const requestLocation = () => {
    setGeoError("");
    if (!("geolocation" in navigator)) {
      setGeoError("Location not supported");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const lat = Number(latitude.toFixed(5));
        const lon = Number(longitude.toFixed(5));
        setCoords({ lat, lon });
        setLocString(`${lat},${lon}`);
        toast({ title: "Location Enabled", description: "Using your current location" });
      },
      () => {
        setGeoError("Location permission denied");
        toast({ title: "Location Denied", description: "Showing generic emergency info", variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const { data: fetchedServices, isLoading, error } = useQuery<EmergencyService[]>({
    queryKey: ['/api/v1/emergency', locString],
    enabled: !!locString,
    queryFn: async ({ queryKey }) => {
      const [, loc] = queryKey as [string, string];
      const res = await apiRequest('GET', `/api/v1/emergency?location=${encodeURIComponent(loc)}`);
      return res.json();
    },
    staleTime: 30_000,
  });

  // Mock emergency services data - in production, this would come from a real API
  const emergencyServices: EmergencyService[] = [
    { id: '1', name: 'AIIMS Hospital', type: 'hospital', address: 'Ansari Nagar, New Delhi', phone: '108', distance: '—', latitude: 28.5672, longitude: 77.2100 },
    { id: '2', name: 'Delhi Police Station', type: 'police', address: 'Connaught Place, New Delhi', phone: '100', distance: '—', latitude: 28.6304, longitude: 77.2177 },
    { id: '3', name: 'Embassy of India', type: 'embassy', address: 'Chanakyapuri, New Delhi', phone: '+91-11-2301-7100', distance: '—', latitude: 28.6000, longitude: 77.2000 },
    { id: '4', name: 'Apollo Pharmacy', type: 'pharmacy', address: 'Karol Bagh, New Delhi', phone: '1860-500-0100', distance: '—', latitude: 28.6517, longitude: 77.1925 },
  ];

  const servicesWithDistance = useMemo(() => {
    const calc = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };
    if (!coords) return emergencyServices;
    return emergencyServices.map(s => ({ ...s, distance: `${calc(coords.lat, coords.lon, s.latitude, s.longitude).toFixed(1)} km` }));
  }, [coords]);

  const serviceIcons: Record<EmergencyService['type'], { icon: string; color: string }> = {
    hospital: { icon: 'fas fa-hospital', color: 'text-ios-red' },
    police: { icon: 'fas fa-shield-alt', color: 'text-ios-blue' },
    embassy: { icon: 'fas fa-building', color: 'text-ios-orange' },
    fire: { icon: 'fas fa-fire-extinguisher', color: 'text-ios-red' },
    pharmacy: { icon: 'fas fa-pills', color: 'text-ios-green' },
  };

  const handleSOSCall = () => {
    toast({
      title: "SOS Call",
      description: "Dialing emergency services...",
      variant: "destructive",
    });
    window.location.href = 'tel:112';
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
    // Open directions in the user's preferred maps app
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${service.latitude},${service.longitude}&travelmode=driving`;
    window.open(mapsUrl, '_blank');
    
    toast({
      title: "Directions Opened",
      description: `Getting directions to ${service.name}`,
    });
  };

  const services = fetchedServices && fetchedServices.length ? fetchedServices : servicesWithDistance;
  return (
    <Card className={`bg-ios-card border-ios-gray ${className}`} data-testid="emergency-services">
      <CardHeader>
        <CardTitle className="text-lg font-bold text-white flex items-center">
          <i className="fas fa-shield-alt text-ios-red mr-2"></i>
          Emergency Services
        </CardTitle>
        <p className="text-sm text-ios-gray">{coords ? "Near your location" : `Near ${location}`}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Button onClick={requestLocation} className="bg-ios-blue hover:bg-blue-600" data-testid="button-enable-location">
            <i className="fas fa-location-arrow mr-2"></i>
            Enable Location
          </Button>
          {geoError && <span className="text-xs text-red-400">{geoError}</span>}
        </div>
        <Button
          onClick={handleSOSCall}
          className="w-full bg-ios-red hover:bg-red-600 text-white font-bold py-4 text-lg"
          data-testid="button-sos"
        >
          <i className="fas fa-phone mr-2"></i>
          SOS EMERGENCY CALL
        </Button>
        <div className="space-y-3">
          {isLoading && (
            <div className="text-center py-6 text-ios-gray" data-testid="emergency-loading">Loading…</div>
          )}
          {!isLoading && services.map((service, idx) => (
            <motion.div 
              key={service.id} 
              className="bg-ios-darker rounded-xl p-4"
              data-testid={`emergency-service-${service.id}`}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: idx * 0.05 }}
              viewport={{ once: true }}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center space-x-3">
                  <div className={`text-xl ${serviceIcons[service.type].color}`}>
                    <i className={serviceIcons[service.type].icon}></i>
                  </div>
                  <div>
                    <h3 className="font-medium text-white">{service.name}</h3>
                    <p className="text-sm text-ios-gray">{service.address}</p>
                    <p className="text-xs text-ios-gray">{service.distance} away</p>
                  </div>
                </div>
                <span className="text-xs text-ios-blue bg-ios-blue/20 px-2 py-1 rounded-full">
                  {service.type.charAt(0).toUpperCase() + service.type.slice(1)}
                </span>
              </div>
              
              <div className="flex space-x-2 mt-3">
                <Button
                  onClick={() => handleCallService(service)}
                  size="sm"
                  className="flex-1 bg-ios-green hover:bg-green-600"
                  data-testid={`button-call-${service.id}`}
                >
                  <i className="fas fa-phone mr-1 text-xs"></i>
                  Call
                </Button>
                <Button
                  onClick={() => handleGetDirections(service)}
                  size="sm"
                  variant="outline"
                  className="flex-1 bg-ios-darker border-ios-gray text-white hover:bg-ios-card"
                  data-testid={`button-directions-${service.id}`}
                >
                  <i className="fas fa-directions mr-1 text-xs"></i>
                  Directions
                </Button>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Help Information */}
        <div className="bg-ios-red/20 rounded-xl p-4 border border-ios-red/30">
          <h4 className="font-medium text-ios-red mb-2 flex items-center">
            <i className="fas fa-exclamation-triangle mr-2"></i>
            Emergency Numbers
          </h4>
          <div className="space-y-1 text-sm">
            <p className="text-white"><strong>Police:</strong> 100 (India) / 112 (National)</p>
            <p className="text-white"><strong>Medical (Ambulance):</strong> 108 (India) / 112 (National)</p>
            <p className="text-white"><strong>Fire:</strong> 101 (India) / 112 (National)</p>
          </div>
        </div>

        <div className="text-center">
          <p className="text-xs text-ios-gray">
            <i className="fas fa-info-circle mr-1"></i>
            Location services required for accurate results
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
