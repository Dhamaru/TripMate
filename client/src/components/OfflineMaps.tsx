import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";

interface MapRegion {
  id: string;
  name: string;
  country: string;
  size: string;
  downloaded: boolean;
  downloading: boolean;
  progress: number;
}

interface OfflineMapsProps {
  className?: string;
}

export function OfflineMaps({ className = '' }: OfflineMapsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [mapRegions, setMapRegions] = useState<MapRegion[]>([
    {
      id: '1',
      name: 'Paris',
      country: 'France',
      size: '45 MB',
      downloaded: true,
      downloading: false,
      progress: 100,
    },
    {
      id: '2',
      name: 'Tokyo',
      country: 'Japan',
      size: '62 MB',
      downloaded: false,
      downloading: false,
      progress: 0,
    },
    {
      id: '3',
      name: 'New York City',
      country: 'United States',
      size: '38 MB',
      downloaded: false,
      downloading: false,
      progress: 0,
    },
    {
      id: '4',
      name: 'London',
      country: 'United Kingdom',
      size: '41 MB',
      downloaded: false,
      downloading: false,
      progress: 0,
    },
    {
      id: '5',
      name: 'Santorini',
      country: 'Greece',
      size: '15 MB',
      downloaded: false,
      downloading: false,
      progress: 0,
    },
  ]);

  const { toast } = useToast();
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Mock map display - in a real app, this would use Leaflet or another mapping library
  useEffect(() => {
    if (mapContainerRef.current) {
      // Initialize map here
      // For demo purposes, we'll show a placeholder
      mapContainerRef.current.innerHTML = `
        <div class="w-full h-full bg-gradient-to-br from-blue-900 to-blue-700 rounded-xl flex items-center justify-center text-white">
          <div class="text-center">
            <i class="fas fa-map text-4xl mb-4 opacity-50"></i>
            <p class="text-sm opacity-75">Offline Map View</p>
            <p class="text-xs opacity-50">Interactive map would load here</p>
          </div>
        </div>
      `;
    }
  }, []);

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
          <CardTitle className="text-lg font-bold text-white flex items-center">
            <i className="fas fa-map text-ios-blue mr-2"></i>
            Offline Maps
          </CardTitle>
          <p className="text-sm text-ios-gray">
            {downloadedCount} maps downloaded • {totalSize} MB used
          </p>
        </CardHeader>
        <CardContent>
          <div 
            ref={mapContainerRef}
            className="w-full h-64 bg-ios-darker rounded-xl"
            data-testid="map-container"
          >
            {/* Map will be rendered here */}
          </div>
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
              className="bg-ios-darker rounded-xl p-4"
              data-testid={`map-region-${region.id}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="font-medium text-white">{region.name}</h3>
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
                    >
                      <i className="fas fa-spinner fa-spin mr-1"></i>
                      Downloading
                    </Button>
                  ) : region.downloaded ? (
                    <div className="flex space-x-1">
                      <Button
                        onClick={() => deleteMap(region.id)}
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
                      onClick={() => downloadMap(region.id)}
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
              Maps work without internet connection for navigation
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
