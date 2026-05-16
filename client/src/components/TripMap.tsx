import { useState, useEffect, useRef } from "react";
import L from "leaflet";
// Leaflet.heat expect L to be global
if (typeof window !== 'undefined') {
    (window as any).L = L;
}
import "leaflet.heat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search } from "lucide-react";
import { Slider } from "@/components/ui/slider";

interface TripMapProps {
    destination: string;
    itinerary?: any[];
    origin?: string;
    onAddActivity?: (activity: any, dayNumber: number) => Promise<void>;
    onDeleteActivity?: (dayIndex: number, activityIndex: number) => Promise<void>;
}

export function TripMap({ destination, itinerary, origin, onAddActivity, onDeleteActivity }: TripMapProps) {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<L.Map | null>(null);
    const markersLayerRef = useRef<L.LayerGroup | null>(null);
    const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
    const [geocodeError, setGeocodeError] = useState(false);
    const [loading, setLoading] = useState(false);
    const [mapTheme, setMapTheme] = useState<'light' | 'dark'>('dark');
    const [isAddMode, setIsAddMode] = useState(false);
    const isAddModeRef = useRef(isAddMode);
    const [showHeatMap, setShowHeatMap] = useState(false);
    const [crowdReports, setCrowdReports] = useState<any[]>([]);
    const heatLayerRef = useRef<any>(null);
    const pathLayerRef = useRef<L.LayerGroup | null>(null);
    const [showPaths, setShowPaths] = useState(true);
    const { toast } = useToast();
    const [reportDensity, setReportDensity] = useState(5);

    // Sync ref with state to avoid stale closures in map handlers
    useEffect(() => {
        isAddModeRef.current = isAddMode;
    }, [isAddMode]);

    // Reset coords when destination changes
    useEffect(() => {
        console.log('[TripMap] Destination changed to:', destination);
        setCoords(null);
        setGeocodeError(false);
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
                    setGeocodeError(true);
                }
            } catch (err) {
                console.error("[TripMap] Geocoding exception:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchCoords();
    }, [destination]);

    // Fetch Crowd Reports
    useEffect(() => {
        const fetchCrowdData = async () => {
            try {
                const res = await fetch('/api/v1/crowd/density');
                if (res.ok) {
                    const data = await res.json();
                    setCrowdReports(data.reports || []);
                }
            } catch (err) {
                console.error("Failed to fetch crowd data", err);
            }
        };

        fetchCrowdData();
        const interval = setInterval(fetchCrowdData, 30000); // Refresh every 30s
        return () => clearInterval(interval);
    }, []);

    // Update Heat Map Layer
    useEffect(() => {
        if (!mapInstanceRef.current || !crowdReports) return;

        if (showHeatMap) {
            if (heatLayerRef.current) {
                mapInstanceRef.current.removeLayer(heatLayerRef.current);
            }

            const points = crowdReports.map(r => [r.latitude, r.longitude, r.density / 10]);
            console.log(`[HeatMap] Rendering ${points.length} points`, points);

            if (!(L as any).heatLayer) {
                console.error("[HeatMap] L.heatLayer is not defined! Check plugin loading.");
                return;
            }
            if (!(L as any).heatLayer) {
                console.error("[HeatMap] L.heatLayer IS STILL NOT DEFINED! This plugin is not loading correctly.");
                toast({ title: "Heat Map Error", description: "Heat map plugin failed to load.", variant: "destructive" });
                return;
            }

            try {
                // @ts-ignore
                heatLayerRef.current = (L as any).heatLayer(points, {
                    radius: 35,
                    blur: 20,
                    maxZoom: 17,
                    gradient: { 0.4: 'blue', 0.65: 'lime', 1: 'red' }
                }).addTo(mapInstanceRef.current);
                console.log("[HeatMap] Layer added to map successfully.");
            } catch (err) {
                console.error("[HeatMap] Error creating heat layer:", err);
            }
        } else if (heatLayerRef.current) {
            console.log("[HeatMap] Removing heat layer");
            mapInstanceRef.current.removeLayer(heatLayerRef.current);
            heatLayerRef.current = null;
        }
    }, [showHeatMap, crowdReports]);

    const handleReportCrowd = async () => {
        if (!coords || !mapInstanceRef.current) return;
        const center = mapInstanceRef.current.getCenter();

        try {
            await apiRequest('POST', '/api/v1/crowd/density', {
                latitude: center.lat,
                longitude: center.lng,
                density: reportDensity
            });
            toast({
                title: "Report Submitted",
                description: "Thank you for sharing the current crowd density!",
            });
            // Refresh local data
            const res = await fetch('/api/v1/crowd/density');
            if (res.ok) {
                const data = await res.json();
                setCrowdReports(data.reports || []);
            }
        } catch (err) {
            toast({
                title: "Error",
                description: "Failed to submit report.",
                variant: "destructive"
            });
        }
    };

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

            // Initialize markers and paths layers
            const markersLayer = L.layerGroup().addTo(map);
            markersLayerRef.current = markersLayer;

            const pathLayer = L.layerGroup().addTo(map);
            pathLayerRef.current = pathLayer;

            // Map Click Handler for Adding Locations - REMOVED per user request
            // map.on('click', async (e) => { ... });

            mapInstanceRef.current = map;
        } else {
            // Update existing map view
            mapInstanceRef.current.setView([coords.lat, coords.lon], 12);

            // Update bounds
            const southWest = L.latLng(coords.lat - 0.1, coords.lon - 0.1);
            const northEast = L.latLng(coords.lat + 0.1, coords.lon + 0.1);
            const bounds = L.latLngBounds(southWest, northEast);
            mapInstanceRef.current.setMaxBounds(bounds.pad(0.5));
            mapInstanceRef.current.invalidateSize();
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
                            <div style="font-weight: bold; color: ${typeConfig[act.type?.toLowerCase()]?.color || '#333'}">Day ${act.dayIndex + 1}: ${act.placeName || act.title}</div>
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

        // Handle Paths (Navigation)
        if (pathLayerRef.current) {
            pathLayerRef.current.clearLayers();
            if (showPaths && itinerary) {
                itinerary.forEach((day: any) => {
                    if (day.activities && Array.isArray(day.activities)) {
                        const dayPoints: L.LatLngExpression[] = [];
                        
                        day.activities.forEach((act: any) => {
                            let lat = act.lat || act.latitude || (act.coords && act.coords.lat);
                            let lon = act.lon || act.lng || act.longitude || (act.coords && act.coords.lon);
                            
                            // Filter out (0,0) or obviously invalid coords
                            const nLat = Number(lat);
                            const nLon = Number(lon);
                            if (nLat !== 0 && nLon !== 0 && !isNaN(nLat) && !isNaN(nLon)) {
                                dayPoints.push([nLat, nLon]);
                            }
                        });

                        if (dayPoints.length > 1) {
                            L.polyline(dayPoints, {
                                color: '#3b82f6',
                                weight: 3,
                                opacity: 0.6,
                                dashArray: '10, 10',
                                lineJoin: 'round'
                            }).addTo(pathLayerRef.current!);
                        }
                    }
                });
            }
        }

    }, [coords, mapTheme, itinerary, showPaths]);

    if (!destination) return null;

    if (!loading && geocodeError) return (
        <Card className="bg-card border-border p-6 text-center">
            <p className="text-muted-foreground text-sm">Map unavailable — could not locate <span className="font-semibold text-foreground">{destination}</span>.</p>
            <p className="text-xs text-muted-foreground mt-1">Try editing the trip destination to a more specific city name.</p>
        </Card>
    );

    return (
        <Card className="bg-card border-border">
            <CardHeader>
                <CardTitle className="text-xl font-bold text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4 w-full">
                    <div className="flex flex-col md:flex-row items-start md:items-center gap-4 w-full">
                        <span>Trip Map</span>
                        <div className="flex flex-wrap gap-2">
                            <div className="relative w-40 md:w-52">
                                <Input
                                    placeholder="Search to pin..."
                                    className="h-7 text-[10px] pr-6 bg-black/40 border-[#1E3A8A]/50 text-white placeholder:text-gray-400 focus-visible:ring-0 focus-visible:border-[#1E3A8A]"
                                    onKeyDown={async (e) => {
                                        if (e.key === 'Enter') {
                                            const q = (e.currentTarget as HTMLInputElement).value;
                                            if (!q) return;
                                            try {
                                                const res = await fetch(`/api/v1/geocode?q=${encodeURIComponent(q)}`);
                                                const data = await res.json();
                                                if (Array.isArray(data) && data.length > 0) {
                                                    const { lat, lon } = data[0];

                                                    // Fly to location
                                                    if (mapInstanceRef.current) {
                                                        mapInstanceRef.current.flyTo([lat, lon], 15, {
                                                            animate: true,
                                                            duration: 1.5
                                                        });

                                                        // Add temporary search marker
                                                        const searchIcon = L.divIcon({
                                                            className: 'custom-div-icon',
                                                            html: `<div style="background-color: #ef4444; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 0 10px rgba(239, 68, 68, 0.5); animation: pulse 2s infinite;">
                                                                     <i class="fas fa-search-location" style="color: white; font-size: 12px;"></i>
                                                                   </div>`,
                                                            iconSize: [24, 24],
                                                            iconAnchor: [12, 12]
                                                        });

                                                        const popupContent = document.createElement('div');
                                                        popupContent.style.textAlign = 'center';
                                                        popupContent.style.padding = '5px';
                                                        popupContent.innerHTML = `
                                                            <strong style="color: white; display: block; margin-bottom: 5px;">Found Location</strong>
                                                            <div id="add-search-spot" style="background: #3b82f6; color: white; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 10px; font-weight: bold; margin-top: 5px; display: inline-block;">
                                                                <i class="fas fa-plus mr-1"></i> Add to Trip
                                                            </div>
                                                        `;

                                                        const marker = L.marker([lat, lon], { icon: searchIcon })
                                                            .addTo(mapInstanceRef.current)
                                                            .bindPopup(popupContent)
                                                            .openPopup();

                                                        // Handle click on the popup button
                                                        setTimeout(() => {
                                                            const btn = document.getElementById('add-search-spot');
                                                            if (btn) {
                                                                btn.onclick = async () => {
                                                                    const name = prompt("Enter location name:", q);
                                                                    if (name && onAddActivity) {
                                                                        await onAddActivity({
                                                                            title: name,
                                                                            placeName: name,
                                                                            type: 'sightseeing',
                                                                            time: '10:00 AM',
                                                                            lat,
                                                                            lon,
                                                                            address: q,
                                                                            duration_minutes: 60
                                                                        }, 1);
                                                                        marker.remove();
                                                                    }
                                                                };
                                                            }
                                                        }, 100);

                                                        // Enable Add Mode
                                                        setIsAddMode(true);
                                                        toast({
                                                            title: "Location Found",
                                                            description: "Click anywhere on the map to pin this spot!",
                                                        });
                                                    }
                                                } else {
                                                    toast({
                                                        title: "Not Found",
                                                        description: "Could not find that location.",
                                                        variant: "destructive"
                                                    });
                                                }
                                            } catch (err) {
                                                console.error(err);
                                            }
                                        }
                                    }}
                                />
                                <Search className="absolute right-2 top-1.5 h-3 w-3 text-[#1E3A8A] dark:text-blue-400" />
                            </div>

                            <Button
                                variant={showHeatMap ? "secondary" : "outline"}
                                size="sm"
                                onClick={() => setShowHeatMap(!showHeatMap)}
                                className={`h-7 px-2 text-[10px] uppercase tracking-wider ${showHeatMap ? 'bg-orange-500 text-white' : 'border-orange-500 text-orange-500 hover:bg-orange-50'}`}
                            >
                                <i className="fas fa-fire mr-1"></i>
                                {showHeatMap ? 'Hide Crowds' : 'Heat Map'}
                            </Button>

                            <Button
                                variant={showPaths ? "secondary" : "outline"}
                                size="sm"
                                onClick={() => setShowPaths(!showPaths)}
                                className={`h-7 px-2 text-[10px] uppercase tracking-wider ${showPaths ? 'bg-[#1E3A8A] text-white' : 'border-[#1E3A8A] text-[#1E3A8A] dark:text-blue-400 hover:bg-[#1E3A8A]/10'}`}
                            >
                                <i className="fas fa-route mr-1"></i>
                                {showPaths ? 'Hide Route' : 'Show Route'}
                            </Button>

                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 px-2 text-[10px] uppercase tracking-wider border-emerald-600 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600/10"
                                    >
                                        <i className="fas fa-bullhorn mr-1"></i>
                                        Report
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="bg-card border-border p-4 w-60 z-[1100]">
                                    <div className="space-y-4">
                                        <div className="text-sm font-bold text-white">Report Crowd Density</div>
                                        <div className="text-xs text-muted-foreground">How crowded is it here right now?</div>
                                        <Slider
                                            value={[reportDensity]}
                                            onValueChange={(v) => setReportDensity(v[0])}
                                            max={10}
                                            min={1}
                                            step={1}
                                            className="py-2"
                                        />
                                        <div className="flex justify-between text-[10px] text-muted-foreground">
                                            <span>Quiet</span>
                                            <span>Packed</span>
                                        </div>
                                        <Button
                                            onClick={handleReportCrowd}
                                            className="w-full bg-emerald-600 hover:bg-green-600 h-8 text-xs"
                                        >
                                            Submit Report
                                        </Button>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
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
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E3A8A]"></div>
                        </div>
                    )}
                    {!coords && !loading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-secondary/50 text-muted-foreground">
                            Location not found
                        </div>
                    )}
                    <div ref={mapContainerRef} className="w-full h-full" />
                </div>
            </CardContent>
        </Card >
    );
}
