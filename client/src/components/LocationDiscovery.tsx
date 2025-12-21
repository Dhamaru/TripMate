import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Hotel, Utensils, Landmark, Search, Sparkles, MapPin, Star, Navigation, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Place {
    id: string;
    name: string;
    address: string;
    rating?: number;
    photos: string[];
    location?: { lat: number; lng: number };
    priceLevel?: number;
    reason?: string;
    category?: 'hotels' | 'restaurants' | 'tourist-spots';
}

interface LocationDiscoveryProps {
    tripId: string;
    onPlaceSelect?: (place: Place) => void;
}

export function LocationDiscovery({ tripId }: LocationDiscoveryProps) {
    const [activeCategory, setActiveCategory] = useState<'hotels' | 'restaurants' | 'tourist-spots'>('hotels');
    const [searchQuery, setSearchQuery] = useState('');
    const [places, setPlaces] = useState<Place[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const categories = [
        { id: 'hotels' as const, label: 'Hotels', icon: Hotel },
        { id: 'restaurants' as const, label: 'Restaurants', icon: Utensils },
        { id: 'tourist-spots' as const, label: 'Tourist Spots', icon: Landmark },
    ];

    // Clear places when category changes
    useEffect(() => {
        setPlaces([]);
        setSearchQuery('');
    }, [activeCategory]);

    // Search mutation
    const searchMutation = useMutation({
        mutationFn: async () => {
            const response = await apiRequest('POST', `/api/v1/trips/${tripId}/discover`, {
                category: activeCategory,
                query: searchQuery || undefined,
            });
            return response.json();
        },
        onSuccess: (data) => {
            setPlaces(data.places || []);
            setIsSearching(false);
        },
        onError: () => {
            toast({
                title: 'Search Failed',
                description: 'Unable to search for places. Please try again.',
                variant: 'destructive',
            });
            setIsSearching(false);
        },
    });

    // AI recommendations mutation
    const aiRecommendationsMutation = useMutation({
        mutationFn: async () => {
            const response = await apiRequest('POST', `/api/v1/trips/${tripId}/ai-recommendations`, {
                category: activeCategory,
            });
            return response.json();
        },
        onSuccess: (data) => {
            setPlaces(data.recommendations || []);
            toast({
                title: 'AI Suggestions Ready',
                description: `Found ${data.recommendations?.length || 0} personalized recommendations!`,
            });
        },
        onError: () => {
            toast({
                title: 'AI Suggestions Failed',
                description: 'Unable to generate recommendations. Please try again.',
                variant: 'destructive',
            });
        },
    });

    const handleSearch = () => {
        setIsSearching(true);
        searchMutation.mutate();
    };

    const handleAISuggestions = () => {
        aiRecommendationsMutation.mutate();
    };

    // Add to itinerary mutation
    const addToItineraryMutation = useMutation({
        mutationFn: async (place: Place) => {
            const response = await apiRequest('POST', `/api/v1/trips/${tripId}/add-to-itinerary`, {
                place,
                category: activeCategory,
            });
            return response.json();
        },
        onSuccess: (data, place) => {
            toast({
                title: '✅ Added to Itinerary!',
                description: `${place.name} has been added to your trip plan.`,
            });

            // Invalidate and refetch trip data - using correct query key
            queryClient.invalidateQueries({ queryKey: ['/api/v1/trips', tripId] });

            // Auto-scroll to itinerary section after a short delay (to let the query refresh)
            setTimeout(() => {
                const itinerarySection = document.querySelector('[data-itinerary-section]');
                if (itinerarySection) {
                    itinerarySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 500);
        },
        onError: () => {
            toast({
                title: 'Failed to Add',
                description: 'Unable to add to itinerary. Please try again.',
                variant: 'destructive',
            });
        },
    });

    const handleAddToItinerary = (place: Place) => {
        addToItineraryMutation.mutate(place);
    };

    const handleNavigate = (place: Place) => {
        // Notify parent component about selected place with category
        if (onPlaceSelect) {
            onPlaceSelect({ ...place, category: activeCategory });
        }

        // Scroll to the TripMap section on the same page
        const mapSection = document.querySelector('[data-trip-map]');
        if (mapSection) {
            mapSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

            // Show toast with place info
            toast({
                title: `📍 ${place.name}`,
                description: place.address,
            });
        } else {
            // Fallback: open in new tab if map not found
            if (place.location) {
                const { lat, lng } = place.location;
                window.open(`/app/maps?lat=${lat}&lng=${lng}&name=${encodeURIComponent(place.name)}`, '_blank');
            }
        }
    };

    return (
        <Card className="bg-card border-border">
            <CardHeader>
                <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
                    <Search className="w-5 h-5" />
                    Discover Locations
                </CardTitle>
            </CardHeader>
            <CardContent>
                <Tabs value={activeCategory} onValueChange={(v) => setActiveCategory(v as any)} className="space-y-4">
                    <TabsList className="grid grid-cols-3 w-full bg-ios-darker">
                        {categories.map((cat) => (
                            <TabsTrigger
                                key={cat.id}
                                value={cat.id}
                                className="data-[state=active]:bg-ios-blue data-[state=active]:text-white"
                            >
                                <cat.icon className="w-4 h-4 mr-2" />
                                {cat.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    {categories.map((cat) => (
                        <TabsContent key={cat.id} value={cat.id} className="space-y-4">
                            {/* Search Bar */}
                            <div className="flex gap-2">
                                <Input
                                    type="text"
                                    placeholder={`Search for ${cat.label.toLowerCase()}...`}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                    className="bg-ios-darker border-border text-white"
                                />
                                <Button
                                    onClick={handleSearch}
                                    disabled={searchMutation.isPending}
                                    className="bg-ios-blue hover:bg-ios-blue/80"
                                >
                                    {searchMutation.isPending ? (
                                        <i className="fas fa-spinner fa-spin" />
                                    ) : (
                                        <Search className="w-4 h-4" />
                                    )}
                                </Button>
                            </div>

                            {/* AI Suggestions Button */}
                            <Button
                                onClick={handleAISuggestions}
                                disabled={aiRecommendationsMutation.isPending}
                                className="w-full bg-gradient-to-r from-purple-600 to-ios-blue hover:from-purple-700 hover:to-ios-blue/90"
                            >
                                {aiRecommendationsMutation.isPending ? (
                                    <>
                                        <i className="fas fa-spinner fa-spin mr-2" />
                                        Getting AI Suggestions...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="w-4 h-4 mr-2" />
                                        Get AI Suggestions
                                    </>
                                )}
                            </Button>

                            {/* Results */}
                            <AnimatePresence mode="wait">
                                {places.length > 0 ? (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="space-y-3"
                                    >
                                        {places.map((place, index) => (
                                            <motion.div
                                                key={place.id}
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: index * 0.1 }}
                                                className="bg-ios-darker rounded-lg p-4 border border-ios-gray/20 hover:border-ios-blue/30 transition-all"
                                            >
                                                <div className="flex gap-3">
                                                    {/* Photo */}
                                                    {place.photos && place.photos.length > 0 ? (
                                                        <img
                                                            src={place.photos[0]}
                                                            alt={place.name}
                                                            className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                                                        />
                                                    ) : (
                                                        <div className="w-20 h-20 rounded-lg bg-ios-gray/20 flex items-center justify-center flex-shrink-0">
                                                            <cat.icon className="w-8 h-8 text-ios-gray" />
                                                        </div>
                                                    )}

                                                    {/* Details */}
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="font-semibold text-white truncate">{place.name}</h4>
                                                        <div className="flex items-center gap-2 text-sm text-ios-gray mt-1">
                                                            {place.rating && (
                                                                <div className="flex items-center gap-1">
                                                                    <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" />
                                                                    <span>{place.rating.toFixed(1)}</span>
                                                                </div>
                                                            )}
                                                            {place.priceLevel && (
                                                                <span>{'₹'.repeat(place.priceLevel)}</span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-ios-gray mt-1 line-clamp-1">
                                                            <MapPin className="w-3 h-3 inline mr-1" />
                                                            {place.address}
                                                        </p>
                                                        {place.reason && (
                                                            <p className="text-xs text-ios-blue mt-2 italic">
                                                                💡 {place.reason}
                                                            </p>
                                                        )}
                                                    </div>

                                                    {/* Action Buttons */}
                                                    <div className="flex flex-col gap-2 flex-shrink-0">
                                                        <Button
                                                            onClick={() => handleAddToItinerary(place)}
                                                            size="sm"
                                                            disabled={addToItineraryMutation.isPending}
                                                            className="bg-green-600 hover:bg-green-700 text-white"
                                                        >
                                                            <Plus className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            onClick={() => handleNavigate(place)}
                                                            size="sm"
                                                            className="bg-ios-blue hover:bg-ios-blue/80"
                                                        >
                                                            <Navigation className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </motion.div>
                                ) : (
                                    <div className="text-center text-ios-gray py-8">
                                        <cat.icon className="w-12 h-12 mx-auto mb-2 opacity-20" />
                                        <p className="text-sm">
                                            Search for {cat.label.toLowerCase()} or get AI suggestions to start discovering places
                                        </p>
                                    </div>
                                )}
                            </AnimatePresence>
                        </TabsContent>
                    ))}
                </Tabs>
            </CardContent>
        </Card>
    );
}
