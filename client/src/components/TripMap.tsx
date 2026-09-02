import { useState, useEffect, useRef, useMemo } from "react";
import L from "leaflet";
import { useTheme } from "@/components/layout/ThemeProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NamePromptDialog } from "@/components/ui/NamePromptDialog";
import { Search } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { nextAvailableTime } from "@/lib/time";

// Faked dark mode over OSM's (light-only) tiles — standard invert-hue trick.
const DARK_TILE_FILTER = "invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9)";

interface TripMapProps {
  destination: string;
  itinerary?: any[];
  origin?: string;
  onAddActivity?: (activity: any, dayNumber: number) => Promise<void>;
  onDeleteActivity?: (dayIndex: number, activityIndex: number) => Promise<void>;
}

export function TripMap({
  destination,
  itinerary,
  origin,
  onAddActivity,
  onDeleteActivity,
}: TripMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [geocodeError, setGeocodeError] = useState(false);
  const [loading, setLoading] = useState(false);
  const { theme } = useTheme();
  const mapTheme = useMemo<"light" | "dark">(() => {
    if (theme === "system")
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    return theme;
  }, [theme]);
  const [isAddMode, setIsAddMode] = useState(false);
  const [addSpotDialogOpen, setAddSpotDialogOpen] = useState(false);
  const [pendingAddSpot, setPendingAddSpot] = useState<{
    lat: number;
    lon: number;
    address: string;
    marker: L.Marker;
  } | null>(null);
  const isAddModeRef = useRef(isAddMode);
  const [showHeatMap, setShowHeatMap] = useState(false);
  const [crowdReports, setCrowdReports] = useState<any[]>([]);
  const heatLayerRef = useRef<any>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const pathLayerRef = useRef<L.LayerGroup | null>(null);
  const [showPaths, setShowPaths] = useState(true);
  const { toast } = useToast();
  const [reportDensity, setReportDensity] = useState(5);

  // Load leaflet.heat after mount so window.L is already set
  useEffect(() => {
    (window as any).L = L;
    import("leaflet.heat").catch(() => {});
  }, []);

  // Sync ref with state to avoid stale closures in map handlers
  useEffect(() => {
    isAddModeRef.current = isAddMode;
  }, [isAddMode]);

  // Reset coords when destination changes
  useEffect(() => {
    console.log("[TripMap] Destination changed to:", destination);
    setCoords(null);
    setGeocodeError(false);
  }, [destination]);

  // Fetch destination coordinates
  useEffect(() => {
    if (!destination) {
      console.log("[TripMap] No destination provided, skipping geocode");
      return;
    }

    const fetchCoords = async () => {
      setLoading(true);
      console.log(`[TripMap] Attempting geocode for: "${destination}"`);
      try {
        const res = await fetch(`/api/v1/geocode?q=${encodeURIComponent(destination)}`);
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const data = await res.json();

        if (Array.isArray(data) && data.length > 0) {
          // Filter to results whose display_name contains at least one query word (>2 chars)
          // This prevents Nominatim returning San Francisco for non-US cities
          const queryWords = destination
            .toLowerCase()
            .trim()
            .split(/\s+/)
            .filter((w) => w.length > 2);
          const nameMatched = data.filter((r: any) => {
            const dn = (r.display_name || "").toLowerCase();
            return queryWords.some((w) => dn.includes(w));
          });
          const candidates = nameMatched.length > 0 ? nameMatched : data;

          // Prefer place/boundary results (cities, countries) over streets/addresses
          const PLACE_CLASSES = ["place", "boundary", "natural", "tourism"];
          const sorted = [...candidates].sort((a, b) => {
            const aIsPlace = PLACE_CLASSES.includes(a.class) ? 1 : 0;
            const bIsPlace = PLACE_CLASSES.includes(b.class) ? 1 : 0;
            if (aIsPlace !== bIsPlace) return bIsPlace - aIsPlace;
            return (Number(b.importance) || 0) - (Number(a.importance) || 0);
          });
          const best = sorted[0];
          const lat = Number(best.lat);
          const lon = Number(best.lon);
          setCoords({ lat, lon });
        } else {
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
        const res = await fetch("/api/v1/crowd/density");
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
    if (!mapInstanceRef.current) return;

    if (heatLayerRef.current) {
      mapInstanceRef.current.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }

    if (!showHeatMap) return;

    if (!(L as any).heatLayer) {
      toast({
        title: "Heat Map Unavailable",
        description: "Plugin still loading — try again in a moment.",
        variant: "destructive",
      });
      setShowHeatMap(false);
      return;
    }

    const points = crowdReports.map((r) => [r.latitude, r.longitude, r.density / 10]);
    try {
      // @ts-ignore
      heatLayerRef.current = (L as any)
        .heatLayer(points, {
          radius: 35,
          blur: 20,
          maxZoom: 17,
          gradient: { 0.4: "blue", 0.65: "lime", 1: "red" },
        })
        .addTo(mapInstanceRef.current);
    } catch (err) {
      console.error("[HeatMap] Error creating heat layer:", err);
    }
  }, [showHeatMap, crowdReports]);

  const handleReportCrowd = async () => {
    if (!coords || !mapInstanceRef.current) return;
    const center = mapInstanceRef.current.getCenter();

    try {
      await apiRequest("POST", "/api/v1/crowd/density", {
        latitude: center.lat,
        longitude: center.lng,
        density: reportDensity,
      });
      toast({
        title: "Report Submitted",
        description: "Thank you for sharing the current crowd density!",
      });
      // Refresh local data
      const res = await fetch("/api/v1/crowd/density");
      if (res.ok) {
        const data = await res.json();
        setCrowdReports(data.reports || []);
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to submit report.",
        variant: "destructive",
      });
    }
  };

  // Theme change: OSM only has one (light) tile style, so dark mode is a
  // CSS filter on the tile pane, not a different tile layer/reload.
  useEffect(() => {
    const tilePane = mapInstanceRef.current?.getPane("tilePane");
    if (tilePane) tilePane.style.filter = mapTheme === "dark" ? DARK_TILE_FILTER : "";
  }, [mapTheme]);

  // Initialize or Update Map
  useEffect(() => {
    if (!coords || !mapContainerRef.current) return;
    console.log("[TripMap] Updating map with coords:", coords);

    if (!mapInstanceRef.current) {
      // Fix marker icons
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });

      const map = L.map(mapContainerRef.current).setView([coords.lat, coords.lon], 12);

      // CARTO's free basemap CDN now requires a registered API key
      // (live-confirmed: returns a watermarked placeholder tile, not
      // real map data). OSM needs no key; dark mode is a CSS filter.
      tileLayerRef.current = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);
      const tilePane = map.getPane("tilePane");
      if (tilePane) tilePane.style.filter = mapTheme === "dark" ? DARK_TILE_FILTER : "";

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
              const lat = act.lat || act.latitude || (act.coords && act.coords.lat);
              const lon = act.lon || act.lng || act.longitude || (act.coords && act.coords.lon);

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
          const [lat, lon] = key.split(",").map(Number);
          const firstAct = activities[0];
          const type = (firstAct.type || "sightseeing").toLowerCase();

          const typeConfig: Record<string, { color: string; icon: string }> = {
            sightseeing: { color: "#3b82f6", icon: "fa-camera" },
            restaurant: { color: "#ef4444", icon: "fa-utensils" },
            cafe: { color: "#f97316", icon: "fa-coffee" },
            market: { color: "#10b981", icon: "fa-shopping-basket" },
            museum: { color: "#8b5cf6", icon: "fa-landmark" },
            temple: { color: "#d946ef", icon: "fa-gopuram" },
            park: { color: "#22c55e", icon: "fa-tree" },
            default: { color: "#64748b", icon: "fa-map-marker-alt" },
          };

          const config = typeConfig[type] || typeConfig.default;

          const customIcon = L.divIcon({
            className: "custom-marker",
            html: `<div style="background-color: ${config.color}; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
                                 <i class="fas ${config.icon}" style="color: white; font-size: 14px;"></i>
                               </div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            popupAnchor: [0, -16],
          });

          const popupContainer = document.createElement("div");
          popupContainer.style.minWidth = "200px";

          activities.forEach((act, idx) => {
            const item = document.createElement("div");
            item.innerHTML = `
                            <div style="font-weight: bold; color: ${typeConfig[act.type?.toLowerCase()]?.color || "#333"}">Day ${act.dayIndex + 1}: ${act.placeName || act.title}</div>
                            <div style="font-size: 0.8em; color: #666; margin-top:2px;">${(act.type || "Activity").charAt(0).toUpperCase() + (act.type || "Activity").slice(1)}</div>
                            ${act.time ? `<div style="font-size: 0.85em; margin-top:2px;">⏰ ${act.time}</div>` : ""}
                        `;

            if (onDeleteActivity) {
              const delBtn = document.createElement("button");
              delBtn.innerHTML = '<i class="fas fa-trash-alt mr-1"></i> Delete';
              delBtn.style.cssText =
                "color: #ef4444; font-size: 0.75em; background: none; border: none; padding: 4px 0; cursor: pointer; margin-top: 4px;";
              delBtn.onclick = () => onDeleteActivity(act.dayIndex, act.actIndex);
              item.appendChild(delBtn);
            }

            popupContainer.appendChild(item);
            if (idx < activities.length - 1) {
              const hr = document.createElement("hr");
              hr.style.cssText = "margin: 8px 0; border: 0; border-top: 1px solid #eee;";
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

  // Route paths — own effect so toggling doesn't re-render markers.
  // Draws real road-following routes via OSRM (same routing engine used on
  // the standalone Maps page) instead of a naive straight-line polyline
  // between activities, which doesn't reflect actual travel paths.
  useEffect(() => {
    if (!pathLayerRef.current) return;
    pathLayerRef.current.clearLayers();
    if (!showPaths || !itinerary) return;

    const dayColors = ["#3b82f6", "#8b5cf6", "#ef4444", "#f97316", "#10b981", "#d946ef", "#64748b"];
    let cancelled = false;

    itinerary.forEach((day: any, dayIndex: number) => {
      if (!Array.isArray(day.activities)) return;
      const dayPoints: [number, number][] = [];
      day.activities.forEach((act: any) => {
        const nLat = Number(act.lat ?? act.latitude ?? act.coords?.lat);
        const nLon = Number(act.lon ?? act.lng ?? act.longitude ?? act.coords?.lon);
        if (nLat !== 0 && nLon !== 0 && Number.isFinite(nLat) && Number.isFinite(nLon)) {
          dayPoints.push([nLat, nLon]);
        }
      });
      if (dayPoints.length < 2) return;

      const color = dayColors[dayIndex % dayColors.length];
      const drawStraightFallback = () => {
        if (cancelled || !pathLayerRef.current) return;
        L.polyline(dayPoints, {
          color,
          weight: 3,
          opacity: 0.5,
          dashArray: "6, 8",
          lineJoin: "round",
        }).addTo(pathLayerRef.current);
      };

      const waypoints = dayPoints.map(([lat, lon]) => `${lon},${lat}`).join(";");
      fetch(
        `https://router.project-osrm.org/route/v1/driving/${waypoints}?overview=full&geometries=geojson`,
      )
        .then((res) => res.json())
        .then((json) => {
          if (cancelled || !pathLayerRef.current) return;
          const coords: [number, number][] =
            json?.routes?.[0]?.geometry?.coordinates?.map(
              ([lng, lat]: [number, number]) => [lat, lng] as [number, number],
            ) ?? [];
          if (!coords.length) {
            drawStraightFallback();
            return;
          }
          L.polyline(coords, { color, weight: 3, opacity: 0.7, lineJoin: "round" }).addTo(
            pathLayerRef.current,
          );
        })
        .catch(drawStraightFallback);
    });

    return () => {
      cancelled = true;
    };
  }, [showPaths, itinerary]);

  if (!destination) return null;

  if (!loading && geocodeError)
    return (
      <Card className="bg-card border-border p-6 text-center">
        <p className="text-muted-foreground text-sm">
          Map unavailable — could not locate{" "}
          <span className="font-semibold text-foreground">{destination}</span>.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Try editing the trip destination to a more specific city name.
        </p>
      </Card>
    );

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-xl font-bold text-foreground flex flex-col md:flex-row justify-between items-start md:items-center gap-3 w-full">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-3 w-full">
            <span className="shrink-0">Trip Map</span>
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <div className="relative w-44 md:w-56">
                <Input
                  placeholder="Search to pin..."
                  className="h-8 text-xs pr-7 bg-muted border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-[#163F73]/50 focus-visible:border-[#163F73]/50 rounded-lg"
                  onKeyDown={async (e) => {
                    if (e.key === "Enter") {
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
                              duration: 1.5,
                            });

                            // Add temporary search marker
                            const searchIcon = L.divIcon({
                              className: "custom-div-icon",
                              html: `<div style="background-color: #ef4444; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 0 10px rgba(239, 68, 68, 0.5); animation: pulse 2s infinite;">
                                                                     <i class="fas fa-search-location" style="color: white; font-size: 12px;"></i>
                                                                   </div>`,
                              iconSize: [24, 24],
                              iconAnchor: [12, 12],
                            });

                            const popupContent = document.createElement("div");
                            popupContent.style.textAlign = "center";
                            popupContent.style.padding = "5px";
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
                              const btn = document.getElementById("add-search-spot");
                              if (btn) {
                                btn.onclick = () => {
                                  setPendingAddSpot({ lat, lon, address: q, marker });
                                  setAddSpotDialogOpen(true);
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
                            variant: "destructive",
                          });
                        }
                      } catch (err) {
                        console.error(err);
                      }
                    }
                  }}
                />
                <Search className="absolute right-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHeatMap(!showHeatMap)}
                className={`h-8 px-3 text-xs font-medium rounded-lg gap-1.5 transition-all ${showHeatMap ? "bg-orange-500/15 text-orange-500 hover:bg-orange-500/25" : "text-muted-foreground hover:text-orange-500 hover:bg-orange-500/10"}`}
              >
                <i className="fas fa-fire text-[11px]"></i>
                {showHeatMap ? "Hide Crowds" : "Heat Map"}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPaths(!showPaths)}
                className={`h-8 px-3 text-xs font-medium rounded-lg gap-1.5 transition-all ${showPaths ? "bg-[#1D4E89]/15 text-[#1D4E89] dark:text-blue-400 dark:bg-blue-400/15 hover:bg-[#1D4E89]/25" : "text-muted-foreground hover:text-[#1D4E89] dark:hover:text-blue-400 hover:bg-[#1D4E89]/10"}`}
              >
                <i className="fas fa-route text-[11px]"></i>
                {showPaths ? "Hide Route" : "Show Route"}
              </Button>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-3 text-xs font-medium rounded-lg gap-1.5 text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10 transition-all"
                  >
                    <i className="fas fa-bullhorn text-[11px]"></i>
                    Report
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="bg-card border-border p-4 w-60 z-[1100]">
                  <div className="space-y-4">
                    <div className="text-sm font-bold text-foreground">Report Crowd Density</div>
                    <div className="text-xs text-muted-foreground">
                      How crowded is it here right now?
                    </div>
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
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative isolate w-full h-[300px] md:h-[400px] overflow-hidden">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-secondary/50 z-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D4E89]"></div>
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

      <NamePromptDialog
        open={addSpotDialogOpen}
        title="Location name"
        defaultValue={pendingAddSpot?.address ?? ""}
        confirmLabel="Add to Trip"
        onOpenChange={(open) => {
          setAddSpotDialogOpen(open);
          if (!open) {
            pendingAddSpot?.marker.remove();
            setPendingAddSpot(null);
          }
        }}
        onConfirm={async (name) => {
          if (!pendingAddSpot || !onAddActivity) return;
          const { lat, lon, address } = pendingAddSpot;
          // Was a hardcoded "10:00 AM" for every pin added this way — two
          // places tagged from the map in the same session both landed on
          // the exact same time and got flagged as a chronology overlap
          // (the itinerary already validates for this; the bug was on the
          // create side, not the validator). Stack new pins after
          // whatever's already scheduled that day instead.
          const dayActivities = itinerary?.[0]?.activities ?? [];
          await onAddActivity(
            {
              title: name,
              placeName: name,
              type: "sightseeing",
              time: nextAvailableTime(dayActivities),
              lat,
              lon,
              address,
              duration_minutes: 60,
            },
            1,
          );
          // marker cleanup happens in onOpenChange, which NamePromptDialog
          // calls with open=false right after this resolves.
        }}
      />
    </Card>
  );
}
