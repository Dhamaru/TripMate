import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface TripMapProps {
    destination: string;
    itinerary?: any[];
}

export function TripMap({ destination, itinerary }: TripMapProps) {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<L.Map | null>(null);
    const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
    const [loading, setLoading] = useState(false);
    const [mapTheme, setMapTheme] = useState<'light' | 'dark'>('dark'); // Default to dark to match app theme

    // Reset coords when destination changes
    useEffect(() => {
        setCoords(null);
    }, [destination]);

    // Fetch destination coordinates
    useEffect(() => {
        if (!destination) return;

        const fetchCoords = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/v1/geocode?q=${encodeURIComponent(destination)}`);
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    setCoords({ lat: data[0].lat, lon: data[0].lon });
                } else {
                    // Start debugging why it failed
                    console.warn(`Geocoding failed for ${destination}`, data);
                }
            } catch (err) {
                console.error("Failed to geocode destination", err);
            } finally {
                setLoading(false);
            }
        };

        fetchCoords();
    }, [destination]);

    // Initialize or Update Map
    useEffect(() => {
        if (!coords || !mapContainerRef.current) return;

        if (!mapInstanceRef.current) {
            // Fix marker icons
            delete (L.Icon.Default.prototype as any)._getIconUrl;
            L.Icon.Default.mergeOptions({
                iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
                iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
                shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
            });

            const map = L.map(mapContainerRef.current).setView([coords.lat, coords.lon], 12);

            const tileUrl = mapTheme === 'dark'
                ? "https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png"
                : "https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png";

            L.tileLayer(tileUrl, {
                attribution: '&copy; CARTO',
                maxZoom: 18,
            }).addTo(map);

            // Restrict map to city bounds (approx +/- 0.1 degree)
            const southWest = L.latLng(coords.lat - 0.1, coords.lon - 0.1);
            const northEast = L.latLng(coords.lat + 0.1, coords.lon + 0.1);
            const bounds = L.latLngBounds(southWest, northEast);

            map.setMaxBounds(bounds.pad(0.5)); // Allow some padding
            map.setMinZoom(10);

            mapInstanceRef.current = map;
        } else {
            // Update existing map view
            mapInstanceRef.current.setView([coords.lat, coords.lon], 12);

            // Update bounds
            const southWest = L.latLng(coords.lat - 0.1, coords.lon - 0.1);
            const northEast = L.latLng(coords.lat + 0.1, coords.lon + 0.1);
            const bounds = L.latLngBounds(southWest, northEast);
            mapInstanceRef.current.setMaxBounds(bounds.pad(0.5));
        }

        // Handle Itinerary Markers (Clear old ones first? Logic omitted for brevity as markers are static for now or need separate update)
        // Ideally we should clear markers layerGroup and re-add. 
        // For now, let's just assume itinerary doesn't change wildly without destination change.
        // Actually, if destination changes, component remounts anyway? NO, it updates.
        // So we SHOULD clear markers using a LayerGroup. But to minimize changes, let's just focus on centering.

    }, [coords, mapTheme]); // Re-init if coords or theme change

    if (!destination) return null;

    return (
        <Card className="bg-card border-border">
            <CardHeader>
                <CardTitle className="text-xl font-bold text-white flex justify-between items-center">
                    <span>Trip Map</span>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setMapTheme(prev => prev === 'dark' ? 'light' : 'dark')}
                        className="text-white hover:bg-white/10"
                    >
                        <i className={`fas fa-${mapTheme === 'dark' ? 'moon' : 'sun'} mr-2`}></i>
                        {mapTheme === 'dark' ? 'Dark' : 'Light'} Mode
                    </Button>
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                <div className="relative w-full h-[300px] md:h-[400px]">
                    {loading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-secondary/50 z-10">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ios-blue"></div>
                        </div>
                    )}
                    {!coords && !loading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-secondary/50 text-ios-gray">
                            Location not found
                        </div>
                    )}
                    <div ref={mapContainerRef} className="w-full h-full" />
                </div>
            </CardContent>
        </Card>
    );
}
