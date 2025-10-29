import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface MapRegion {
  id: string;
  name: string;
  country: string;
  size: string;
  downloaded: boolean;
  downloading: boolean;
  progress: number;
  lat: number;
  lng: number;
  zoom: number;
}

interface OfflineMapsProps {
  className?: string;
}

export function OfflineMaps({ className = '' }: OfflineMapsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<MapRegion | null>(null);
  const [mapRegions, setMapRegions] = useState<MapRegion[]>([
    {
      id: '1',
      name: 'Paris',
      country: 'France',
      size: '45 MB',
      downloaded: true,
      downloading: false,
      progress: 100,
      lat: 48.8566,
      lng: 2.3522,
      zoom: 12,
    },
    {
      id: '2',
      name: 'Tokyo',
      country: 'Japan',
      size: '62 MB',
      downloaded: false,
      downloading: false,
      progress: 0,
      lat: 35.6762,
      lng: 139.6503,
      zoom: 12,
    },
    {
      id: '3',
      name: 'New York City',
      country: 'United States',
      size: '38 MB',
      downloaded: false,
      downloading: false,
      progress: 0,
      lat: 40.7128,
      lng: -74.0060,
      zoom: 12,
    },
    {
      id: '4',
      name: 'London',
      country: 'United Kingdom',
      size: '41 MB',
      downloaded: false,
      downloading: false,
      progress: 0,
      lat: 51.5074,
      lng: -0.1278,
      zoom: 12,
    },
    {
      id: '5',
      name: 'Mumbai',
      country: 'India',
      size: '52 MB',
      downloaded: false,
      downloading: false,
      progress: 0,
      lat: 19.0760,
      lng: 72.8777,
      zoom: 12,
    },
  ]);

  const { toast } = useToast();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Fix for default marker icons
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    });

    // Create map instance
    const map = L.map(mapContainerRef.current).setView([20, 0], 2);

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18,
    }).addTo(map);

    mapInstanceRef.current = map;

    // Show downloaded region by default (Paris)
    const downloadedRegion = mapRegions.find(r => r.downloaded);
    if (downloadedRegion) {
      map.setView([downloadedRegion.lat, downloadedRegion.lng], downloadedRegion.zoom);
      const marker = L.marker([downloadedRegion.lat, downloadedRegion.lng])
        .addTo(map)
        .bindPopup(`<b>${downloadedRegion.name}</b><br/>${downloadedRegion.country}<br/><small>Downloaded</small>`)
        .openPopup();
      markerRef.current = marker;
      setSelectedRegion(downloadedRegion);
    }

    // Cleanup
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Handle region selection
  const handleRegionClick = (region: MapRegion) => {
    setSelectedRegion(region);
    
    if (mapInstanceRef.current) {
      // Fly to the region
      mapInstanceRef.current.flyTo([region.lat, region.lng], region.zoom, {
        duration: 1.5,
      });

      // Update marker
      if (markerRef.current) {
        markerRef.current.remove();
      }

      const marker = L.marker([region.lat, region.lng])
        .addTo(mapInstanceRef.current)
        .bindPopup(
          `<b>${region.name}</b><br/>${region.country}<br/><small>${
            region.downloaded ? 'Downloaded' : 'Not Downloaded'
          }</small>`
        )
        .openPopup();
      
      markerRef.current = marker;
    }
  };

  const downloadMap = (regionId: string) => {
    setMapRegions(prev => prev.map(region => 
      region.id === regionId 
        ? { ...region, downloading: true, progress: 0 }
        : region
    ));

    // Simulate download progress
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 20;
      
      setMapRegions(prev => prev.map(region => 
        region.id === regionId 
          ? { ...region, progress: Math.min(progress, 100) }
          : region
      ));

      if (progress >= 100) {
        clearInterval(interval);
        setMapRegions(prev => prev.map(region => 
          region.id === regionId 
            ? { ...region, downloading: false, downloaded: true, progress: 100 }
            : region
        ));
        
        const region = mapRegions.find(r => r.id === regionId);
        toast({
          title: "Download Complete",
          description: `${region?.name} map is now available offline`,
        });

        // Update marker if this region is selected
        if (selectedRegion?.id === regionId && markerRef.current && mapInstanceRef.current) {
          markerRef.current.remove();
          const marker = L.marker([region!.lat, region!.lng])
            .addTo(mapInstanceRef.current)
            .bindPopup(`<b>${region!.name}</b><br/>${region!.country}<br/><small>Downloaded</small>`)
            .openPopup();
          markerRef.current = marker;
        }
      }
    }, 500);

    toast({
      title: "Download Started",
      description: "Downloading map for offline use...",
    });
  };

  const deleteMap = (regionId: string) => {
    setMapRegions(prev => prev.map(region => 
      region.id === regionId 
        ? { ...region, downloaded: false, progress: 0 }
        : region
    ));

    const region = mapRegions.find(r => r.id === regionId);
    toast({
      title: "Map Deleted",
      description: `${region?.name} offline map has been removed`,
    });

    // Update marker if this region is selected
    if (selectedRegion?.id === regionId && markerRef.current && mapInstanceRef.current) {
      markerRef.current.remove();
      const marker = L.marker([region!.lat, region!.lng])
        .addTo(mapInstanceRef.current)
        .bindPopup(`<b>${region!.name}</b><br/>${region!.country}<br/><small>Not Downloaded</small>`)
        .openPopup();
      markerRef.current = marker;
    }
  };

  const filteredRegions = mapRegions.filter(region => 
    region.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    region.country.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const downloadedCount = mapRegions.filter(region => region.downloaded).length;
  const totalSize = mapRegions
    .filter(region => region.downloaded)
    .reduce((sum, region) => sum + parseInt(region.size), 0);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Map Display */}
      <Card className="bg-ios-card border-ios-gray" data-testid="offline-map-display">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-white flex items-center justify-between">
            <div className="flex items-center">
              <i className="fas fa-map text-ios-blue mr-2"></i>
              Interactive Map View
            </div>
            {selectedRegion && (
              <span className="text-sm font-normal text-ios-gray">
                Viewing: {selectedRegion.name}, {selectedRegion.country}
              </span>
            )}
          </CardTitle>
          <p className="text-sm text-ios-gray">
            {downloadedCount} maps downloaded • {totalSize} MB used
          </p>
        </CardHeader>
        <CardContent>
          <div 
            ref={mapContainerRef}
            className="w-full h-96 bg-ios-darker rounded-xl overflow-hidden"
            data-testid="map-container"
            style={{ zIndex: 0 }}
          >
            {/* Leaflet map will be rendered here */}
          </div>
          <p className="text-xs text-ios-gray mt-4 text-center">
            <i className="fas fa-info-circle mr-1"></i>
            Click on a city below to view its location on the map
          </p>
        </CardContent>
      </Card>

      {/* Download Manager */}
      <Card className="bg-ios-card border-ios-gray" data-testid="offline-map-manager">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-white">Download Maps</CardTitle>
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for a city or country..."
            className="bg-ios-darker border-ios-gray text-white placeholder-ios-gray"
            data-testid="input-search-maps"
          />
        </CardHeader>
        <CardContent className="space-y-3">
          {filteredRegions.map((region) => (
            <div 
              key={region.id} 
              className={`bg-ios-darker rounded-xl p-4 cursor-pointer transition-all ${
                selectedRegion?.id === region.id ? 'ring-2 ring-ios-blue' : 'hover:bg-ios-card'
              }`}
              onClick={() => handleRegionClick(region)}
              data-testid={`map-region-${region.id}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center">
                    <h3 className="font-medium text-white mr-2">{region.name}</h3>
                    {selectedRegion?.id === region.id && (
                      <span className="text-xs text-ios-blue">
                        <i className="fas fa-eye mr-1"></i>Viewing
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-ios-gray">{region.country} • {region.size}</p>
                </div>
                
                <div className="flex items-center space-x-2">
                  {region.downloaded && (
                    <span className="text-xs text-ios-green bg-ios-green/20 px-2 py-1 rounded-full">
                      <i className="fas fa-check mr-1"></i>Downloaded
                    </span>
                  )}
                  
                  {region.downloading ? (
                    <Button
                      size="sm"
                      disabled
                      className="bg-ios-gray cursor-not-allowed"
                      data-testid={`button-downloading-${region.id}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <i className="fas fa-spinner fa-spin mr-1"></i>
                      Downloading
                    </Button>
                  ) : region.downloaded ? (
                    <div className="flex space-x-1">
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteMap(region.id);
                        }}
                        size="sm"
                        variant="outline"
                        className="bg-ios-darker border-ios-red text-ios-red hover:bg-ios-red hover:text-white"
                        data-testid={`button-delete-${region.id}`}
                      >
                        <i className="fas fa-trash text-xs"></i>
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadMap(region.id);
                      }}
                      size="sm"
                      className="bg-ios-blue hover:bg-blue-600"
                      data-testid={`button-download-${region.id}`}
                    >
                      <i className="fas fa-download mr-1"></i>
                      Download
                    </Button>
                  )}
                </div>
              </div>
              
              {region.downloading && (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-ios-gray">Downloading...</span>
                    <span className="text-xs text-ios-gray">{Math.round(region.progress)}%</span>
                  </div>
                  <Progress 
                    value={region.progress} 
                    className="h-2"
                    data-testid={`progress-download-${region.id}`}
                  />
                </div>
              )}
            </div>
          ))}

          {filteredRegions.length === 0 && (
            <div className="text-center py-8">
              <div className="text-ios-gray mb-4">
                <i className="fas fa-search text-4xl"></i>
              </div>
              <p className="text-ios-gray text-sm">No maps found</p>
              <p className="text-ios-gray text-xs">Try searching for a different location</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Storage Info */}
      <Card className="bg-ios-card border-ios-gray" data-testid="storage-info">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-white">Storage Used</h3>
              <p className="text-sm text-ios-gray">{totalSize} MB of offline maps</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-ios-blue">{downloadedCount}</p>
              <p className="text-xs text-ios-gray">Maps Available</p>
            </div>
          </div>
          
          <div className="mt-4 text-center">
            <p className="text-xs text-ios-gray">
              <i className="fas fa-info-circle mr-1"></i>
              Downloaded maps work without internet connection for navigation
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
