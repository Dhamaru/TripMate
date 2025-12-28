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
    const markersLayerRef = useRef<L.LayerGroup | null>(null);
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

            // Initialize markers layer
            const markersLayer = L.layerGroup().addTo(map);
            markersLayerRef.current = markersLayer;

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

        // Handle Itinerary Markers
        if (markersLayerRef.current) {
            markersLayerRef.current.clearLayers();

            if (itinerary) {
                const markersMap = new Map<string, any[]>();

                itinerary.forEach((day: any) => {
                    if (day.activities && Array.isArray(day.activities)) {
                        day.activities.forEach((act: any) => {
                            let lat = act.lat || act.latitude || (act.coords && act.coords.lat);
                            let lon = act.lon || act.lng || act.longitude || (act.coords && act.coords.lon);

                            if (lat && lon) {
                                const key = `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
                                if (!markersMap.has(key)) {
                                    markersMap.set(key, []);
                                }
                                markersMap.get(key)?.push(act);
                            }
                        });
                    }
                });

                markersMap.forEach((activities, key) => {
                    const [lat, lon] = key.split(',').map(Number);
                    const firstAct = activities[0];
                    const type = (firstAct.type || 'sightseeing').toLowerCase();

                    // Map types to colors and icons
                    const typeConfig: Record<string, { color: string, icon: string }> = {
                        sightseeing: { color: '#3b82f6', icon: 'fa-camera' },    // Blue
                        restaurant: { color: '#ef4444', icon: 'fa-utensils' },   // Red
                        cafe: { color: '#f97316', icon: 'fa-coffee' },           // Orange
                        market: { color: '#10b981', icon: 'fa-shopping-basket' }, // Green
                        museum: { color: '#8b5cf6', icon: 'fa-landmark' },       // Purple
                        temple: { color: '#d946ef', icon: 'fa-gopuram' },        // Pink
                        park: { color: '#22c55e', icon: 'fa-tree' },             // Green
                        default: { color: '#64748b', icon: 'fa-map-marker-alt' } // Gray
                    };

                    const config = typeConfig[type] || typeConfig.default;

                    const customIcon = L.divIcon({
                        className: 'custom-marker',
                        html: `<div style="background-color: ${config.color}; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
                                 <i class="fas ${config.icon}" style="color: white; font-size: 14px;"></i>
                               </div>`,
                        iconSize: [32, 32],
                        iconAnchor: [16, 16],
                        popupAnchor: [0, -16]
                    });

                    const popupContent = activities.map(act =>
                        `<div>
                            <div style="font-weight: bold; color: ${typeConfig[act.type?.toLowerCase()]?.color || '#333'}">${act.placeName || act.title}</div>
                            <div style="font-size: 0.8em; color: #666; margin-top:2px;">${(act.type || 'Activity').charAt(0).toUpperCase() + (act.type || 'Activity').slice(1)}</div>
                            ${act.time ? `<div style="font-size: 0.85em; margin-top:2px;">⏰ ${act.time}</div>` : ''}
                        </div>`
                    ).join('<hr style="margin: 8px 0; border: 0; border-top: 1px solid #eee;">');

                    L.marker([lat, lon], { icon: customIcon })
                        .addTo(markersLayerRef.current!)
                        .bindPopup(popupContent, { minWidth: 200 });
                });
            }
        }

    }, [coords, mapTheme, itinerary]); // Re-init if coords or theme change

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
