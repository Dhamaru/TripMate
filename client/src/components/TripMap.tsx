import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface TripMapProps {
    destination: string;
    itinerary?: any[];
    onAddActivity?: (activity: any, dayNumber: number) => Promise<void>;
    onDeleteActivity?: (dayIndex: number, activityIndex: number) => Promise<void>;
}

export function TripMap({ destination, itinerary, onAddActivity, onDeleteActivity }: TripMapProps) {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<L.Map | null>(null);
    const markersLayerRef = useRef<L.LayerGroup | null>(null);
    const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
    const [loading, setLoading] = useState(false);
    const [mapTheme, setMapTheme] = useState<'light' | 'dark'>('dark');
    const [isAddMode, setIsAddMode] = useState(false);

    // Reset coords when destination changes
    useEffect(() => {
        console.log('[TripMap] Destination changed to:', destination);
        setCoords(null);
    }, [destination]);

    // Fetch destination coordinates
    useEffect(() => {
        if (!destination) {
            console.log('[TripMap] No destination provided, skipping geocode');
            return;
        }

        const fetchCoords = async () => {
            setLoading(true);
            console.log(`[TripMap] Attempting geocode for: "${destination}"`);
            try {
                const res = await fetch(`/api/v1/geocode?q=${encodeURIComponent(destination)}`);
                if (!res.ok) {
                    console.error(`[TripMap] Geocode API error: ${res.status} ${res.statusText}`);
                    setLoading(false);
                    return;
                }
                const data = await res.json();
                console.log(`[TripMap] Geocode response for "${destination}":`, JSON.stringify(data));

                if (Array.isArray(data) && data.length > 0) {
                    const first = data[0];
                    const lat = Number(first.lat);
                    const lon = Number(first.lon);

                    console.log(`[TripMap] Geocode result: ${lat}, ${lon} (${first.display_name || first.name})`);

                    // Specific check for San Francisco (37.7749, -122.4194)
                    if (Math.abs(lat - 37.7749) < 0.05 && Math.abs(lon - (-122.4194)) < 0.05) {
                        console.warn('[TripMap] WARNING: Geocoder returned coordinates near San Francisco. This matches the reported bug.');
                    }

                    setCoords({ lat, lon });
                } else {
                    console.warn(`[TripMap] Geocoding returned no results for ${destination}`, data);
                }
            } catch (err) {
                console.error("[TripMap] Geocoding exception:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchCoords();
    }, [destination]);

    // Initialize or Update Map
    useEffect(() => {
        if (!coords || !mapContainerRef.current) return;
        console.log('[TripMap] Updating map with coords:', coords);

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

            map.setMaxBounds(bounds.pad(0.5));
            map.setMinZoom(10);

            // Initialize markers layer
            const markersLayer = L.layerGroup().addTo(map);
            markersLayerRef.current = markersLayer;

            // Map Click Handler for Adding Locations
            map.on('click', async (e) => {
                // Check a ref to get the current value of isAddMode
                if (!document.querySelector('.bg-red-500')) return; // Hacky way to check if button is in cancel mode

                const { lat, lng } = e.latlng;
                const name = prompt("Enter custom location name:", "New Spot");
                if (name && onAddActivity) {
                    await onAddActivity({
                        placeName: name,
                        type: 'sightseeing',
                        time: '10:00 AM',
                        lat,
                        lon: lng,
                        address: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
                        duration_minutes: 60,
                        routeFromPrevious: { mode: 'taxi', distance_km: 1, travel_time_minutes: 5, from: 'Previous', to: name }
                    }, 1); // Default to day 1 for now or we could prompt
                }
            });

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

                itinerary.forEach((day: any, dayIndex: number) => {
                    if (day.activities && Array.isArray(day.activities)) {
                        day.activities.forEach((act: any, actIndex: number) => {
                            let lat = act.lat || act.latitude || (act.coords && act.coords.lat);
                            let lon = act.lon || act.lng || act.longitude || (act.coords && act.coords.lon);

                            if (lat && lon) {
                                const key = `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
                                if (!markersMap.has(key)) {
                                    markersMap.set(key, []);
                                }
                                markersMap.get(key)?.push({ ...act, dayIndex, actIndex });
                            }
                        });
                    }
                });

                markersMap.forEach((activities, key) => {
                    const [lat, lon] = key.split(',').map(Number);
                    const firstAct = activities[0];
                    const type = (firstAct.type || 'sightseeing').toLowerCase();

                    const typeConfig: Record<string, { color: string, icon: string }> = {
                        sightseeing: { color: '#3b82f6', icon: 'fa-camera' },
                        restaurant: { color: '#ef4444', icon: 'fa-utensils' },
                        cafe: { color: '#f97316', icon: 'fa-coffee' },
                        market: { color: '#10b981', icon: 'fa-shopping-basket' },
                        museum: { color: '#8b5cf6', icon: 'fa-landmark' },
                        temple: { color: '#d946ef', icon: 'fa-gopuram' },
                        park: { color: '#22c55e', icon: 'fa-tree' },
                        default: { color: '#64748b', icon: 'fa-map-marker-alt' }
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

                    const popupContainer = document.createElement('div');
                    popupContainer.style.minWidth = '200px';

                    activities.forEach((act, idx) => {
                        const item = document.createElement('div');
                        item.innerHTML = `
                            <div style="font-weight: bold; color: ${typeConfig[act.type?.toLowerCase()]?.color || '#333'}">${act.placeName || act.title}</div>
                            <div style="font-size: 0.8em; color: #666; margin-top:2px;">${(act.type || 'Activity').charAt(0).toUpperCase() + (act.type || 'Activity').slice(1)}</div>
                            ${act.time ? `<div style="font-size: 0.85em; margin-top:2px;">⏰ ${act.time}</div>` : ''}
                        `;

                        if (onDeleteActivity) {
                            const delBtn = document.createElement('button');
                            delBtn.innerHTML = '<i class="fas fa-trash-alt mr-1"></i> Delete';
                            delBtn.style.cssText = 'color: #ef4444; font-size: 0.75em; background: none; border: none; padding: 4px 0; cursor: pointer; margin-top: 4px;';
                            delBtn.onclick = () => onDeleteActivity(act.dayIndex, act.actIndex);
                            item.appendChild(delBtn);
                        }

                        popupContainer.appendChild(item);
                        if (idx < activities.length - 1) {
                            const hr = document.createElement('hr');
                            hr.style.cssText = 'margin: 8px 0; border: 0; border-top: 1px solid #eee;';
                            popupContainer.appendChild(hr);
                        }
                    });

                    L.marker([lat, lon], { icon: customIcon })
                        .addTo(markersLayerRef.current!)
                        .bindPopup(popupContainer);
                });
            }
        }

    }, [coords, mapTheme, itinerary]);

    if (!destination) return null;

    return (
        <Card className="bg-card border-border">
            <CardHeader>
                <CardTitle className="text-xl font-bold text-white flex justify-between items-center gap-2">
                    <div className="flex items-center gap-2">
                        <span>Trip Map</span>
                        <Button
                            variant={isAddMode ? "default" : "outline"}
                            size="sm"
                            onClick={() => setIsAddMode(!isAddMode)}
                            className={`ml-2 h-7 px-2 text-[10px] uppercase tracking-wider ${isAddMode ? 'bg-red-500 hover:bg-red-600' : 'border-ios-blue text-ios-blue hover:bg-ios-blue/10'}`}
                        >
                            <i className={`fas fa-${isAddMode ? 'times' : 'plus'} mr-1`}></i>
                            {isAddMode ? 'Cancel' : 'Add Spot'}
                        </Button>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setMapTheme(prev => prev === 'dark' ? 'light' : 'dark')}
                        className="text-white hover:bg-white/10"
                    >
                        <i className={`fas fa-${mapTheme === 'dark' ? 'moon' : 'sun'} mr-2`}></i>
                        {mapTheme === 'dark' ? 'Dark' : 'Light'}
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
