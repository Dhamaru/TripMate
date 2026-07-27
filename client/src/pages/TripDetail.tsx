import { useState, useEffect, useRef, useMemo } from "react";
import { Mountain, Armchair, Landmark, Utensils } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TripMateLogo } from "@/components/TripMateLogo";
import { motion, AnimatePresence } from "framer-motion";
import { PackingList } from "@/components/PackingList";
import { TripMap } from "@/components/TripMap";
import { BudgetTracker } from "@/components/budget/BudgetTracker";
import { ItineraryManager } from "@/components/itinerary/ItineraryManager";
import { CollaboratorManager } from "@/components/collaboration/CollaboratorManager";
import { RecapPanel } from "@/components/journal/RecapPanel";
import PresenceBubbles from "@/components/collaboration/PresenceBubbles";
import { useSocket } from "@/hooks/useSocket";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { z } from "zod";
import { logInfo, logError } from "@/lib/logger";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Link, useParams, useLocation } from "wouter";
import { useAuthStore, useTripStore, useAgentStore } from "@/store";
import type { Trip, JournalEntry } from "@/types/api.types";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import ReactMarkdown from "react-markdown";

const travelStyles = [
  { id: 'adventure', icon: Mountain, name: 'Adventure', color: 'text-[#1D4E89]' },
  { id: 'relaxed', icon: Armchair, name: 'Relaxed', color: 'text-amber-500' },
  { id: 'cultural', icon: Landmark, name: 'Cultural', color: 'text-[#1D4E89]' },
  { id: 'culinary', icon: Utensils, name: 'Culinary', color: 'text-emerald-500' }
];

const statusColors = {
  planning: 'bg-amber-500',
  active: 'bg-emerald-500',
  completed: 'bg-muted-foreground'
};

export default function TripDetail() {
  const getWeatherIcon = (condition: string) => {
    const c = (condition || '').toLowerCase();
    if (c.includes('clear') || c.includes('sun')) return 'fas fa-sun text-amber-500';
    if (c.includes('rain') || c.includes('drizzle')) return 'fas fa-cloud-rain text-[#1D4E89]';
    if (c.includes('snow')) return 'fas fa-snowflake text-blue-200';
    if (c.includes('storm') || c.includes('thunder')) return 'fas fa-bolt text-purple-400';
    return 'fas fa-cloud text-muted-foreground';
  };

  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading, isAuthenticated } = useAuthStore();
  const { currentTrip: trip, fetchTrip, setCurrentTrip, isLoading: tripLoading, error, deleteTrip } = useTripStore();
  const { toast, dismiss } = useToast();
  const activeToastId = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const socketRef = useSocket();
  const { setContext } = useAgentStore();

  useEffect(() => {
    if (id) {
      setContext({ currentTripId: id });
    }
    return () => setContext({ currentTripId: undefined });
  }, [id, setContext]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !id) return;

    socket.on('trip-mutation', (mutation: { type: string; data?: any }) => {
      // Invalidate relevant queries based on mutation type
      if (mutation.type === 'itinerary-updated') {
        fetchTrip(id);
      } else if (mutation.type === 'expenses-updated') {
        fetchTrip(id);
      } else if (mutation.type === 'packing-updated' || mutation.type === 'packing-deleted') {
        queryClient.invalidateQueries({ queryKey: ['packing_lists', id] });
      } else if (mutation.type === 'journal-updated' || mutation.type === 'journal-deleted') {
        queryClient.invalidateQueries({ queryKey: ['/api/v1/journal'] });
      } else if (mutation.type === 'collaborators-updated') {
        fetchTrip(id);
      } else if (mutation.type === 'trip-updated') {
        fetchTrip(id);
      }
      
      toast({
        title: "Live Update",
        description: `A collaborator updated the ${mutation.type.split('-')[0]}.`,
      });
    });

    socket.on('atlas-thinking', ({ isThinking }: { isThinking: boolean }) => {
      setIsAtlasThinking(isThinking);
    });

    return () => {
      socket.off('trip-mutation');
      socket.off('atlas-thinking');
    };
  }, [id, queryClient, socketRef, toast, fetchTrip]);

  const [isEditing, setIsEditing] = useState(false);
  const [heroImgError, setHeroImgError] = useState(false);
  const [isAtlasThinking, setIsAtlasThinking] = useState(false);
  const [tripForm, setTripForm] = useState({
    origin: '',
    destination: '',
    budget: '',
    days: '',
    groupSize: '',
    travelStyle: '',
    status: 'planning' as 'planning' | 'active' | 'completed',
    notes: ''
  });

  const [aiBudget, setAiBudget] = useState('');
  const [aiGroupSize, setAiGroupSize] = useState('');
  const [aiNotes, setAiNotes] = useState('');
  const [planStage, setPlanStage] = useState<'idle' | 'fetching' | 'generating' | 'done' | 'error'>('idle');
  const [showHotels, setShowHotels] = useState(false);
  const [showRestaurants, setShowRestaurants] = useState(false);
  const [showSpots, setShowSpots] = useState(false);
  const [openApiLocations, setOpenApiLocations] = useState<Array<{ id: string; name_en: string; name_local: string; transliteration: string; road?: string; city?: string; country: string; postcode?: string; lat: number; lon: number; display_name: string; source: string }>>([]);
  const [openApiPlanning, setOpenApiPlanning] = useState<Array<{ id: string; title: string; coords: { lat: number; lon: number }; address: string; displayName: string }>>([]);

  useEffect(() => {
    if (planStage === 'fetching' || planStage === 'generating' || planStage === 'done') {
      try { dismiss(); activeToastId.current = null; } catch { }
    }
  }, [planStage]);

  useEffect(() => {
    setHeroImgError(false);
  }, [trip?.imageUrl]);

  const { data: hotelResults, isLoading: hotelsLoading } = useQuery<any>({
    queryKey: ['places_hotels', id, tripForm.destination],
    enabled: showHotels && !!tripForm.destination,
    queryFn: async () => {
      const r = await apiRequest('GET', `/api/v1/places/search?query=${encodeURIComponent('hotels near ' + String(tripForm.destination || ''))}&pageSize=10`);
      const j = await r.json();
      return Array.isArray(j?.items) ? j.items : [];
    },
  });

  const { data: foodResults, isLoading: foodLoading } = useQuery<any>({
    queryKey: ['places_food', id, tripForm.destination],
    enabled: showRestaurants && !!tripForm.destination,
    queryFn: async () => {
      const r = await apiRequest('GET', `/api/v1/places/search?query=${encodeURIComponent('restaurants near ' + String(tripForm.destination || ''))}&pageSize=10`);
      const j = await r.json();
      return Array.isArray(j?.items) ? j.items : [];
    },
  });

  const { data: sightsResults, isLoading: sightsLoading } = useQuery<any>({
    queryKey: ['places_sights', id, tripForm.destination],
    enabled: showSpots && !!tripForm.destination,
    queryFn: async () => {
      // Use the generic search endpoint which is more reliable (uses Google Places + fallbacks)
      // instead of the dedicated tourist-attractions endpoint which uses Overpass and can be flaky (502 errors)
      const r = await apiRequest('GET', `/api/v1/places/search?query=${encodeURIComponent('tourist attractions in ' + String(tripForm.destination || ''))}&pageSize=10`);
      const j = await r.json();
      return Array.isArray(j?.items) ? j.items : [];
    },
  });

  const { data: weather, isLoading: weatherLoading, isError: weatherError } = useQuery<any>({
    queryKey: ['weather_forecast', tripForm.destination],
    enabled: !!tripForm.destination,
    queryFn: async () => {
      const url = `/api/v1/weather?city=${encodeURIComponent(String(tripForm.destination || ''))}&units=metric&lang=en`;
      const r = await apiRequest('GET', url);
      const j = await r.json();
      return j;
    },
    refetchOnWindowFocus: false,
  });

  const { data: hacks } = useQuery<any>({
    queryKey: ['trip_hacks', id],
    enabled: !!id && isAuthenticated,
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/v1/trips/${id}/hacks`);
      return res.json();
    }
  });

  const { data: quietPlaces, isLoading: quietLoading } = useQuery<any>({
    queryKey: ['trip_quiet_places', id],
    enabled: !!id && isAuthenticated,
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/v1/trips/${id}/quiet-places`);
      return res.json();
    }
  });

  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (tripForm.destination) {
      fetch(`/api/v1/geocode?q=${encodeURIComponent(tripForm.destination)}`)
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data) && data.length > 0) {
            setCoords({ lat: Number(data[0].lat), lon: Number(data[0].lon) });
          }
        })
        .catch(() => { });
    }
  }, [tripForm.destination]);

  useEffect(() => {
    try {
      const count = Array.isArray(sightsResults) ? sightsResults.length : 0;
      if (tripForm.destination && count >= 0) {
        logInfo('tourist_spots_shown', { destination: String(tripForm.destination), count });
      }
    } catch { }
  }, [sightsResults, tripForm.destination]);

  const segments = useMemo(() => {
    const arr = openApiPlanning.slice(0, 8);
    const rad = (d: number) => d * Math.PI / 180;
    const distKm = (a: any, b: any) => {
      const R = 6371;
      const dLat = rad(b.coords.lat - a.coords.lat);
      const dLon = rad(b.coords.lon - a.coords.lon);
      const lat1 = rad(a.coords.lat);
      const lat2 = rad(b.coords.lat);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
      const c = 2 * Math.asin(Math.min(1, Math.sqrt(h)));
      return R * c;
    };
    const segs: Array<{ from: any; to: any; km: number; mins: number; mode: string }> = [];
    for (let i = 1; i < arr.length; i++) {
      const a = arr[i - 1], b = arr[i];
      const km = distKm(a, b);
      const mode = km < 2 ? 'walk' : 'transit';
      const speedKmh = mode === 'walk' ? 4.5 : 20;
      const mins = Math.round((km / speedKmh) * 60);
      segs.push({ from: a, to: b, km: Math.round(km * 10) / 10, mins, mode });
    }
    return segs;
  }, [openApiPlanning]);

  useEffect(() => {
    try {
      logInfo('trip_detail_access_attempt', { tripId: id, isAuthenticated });
    } catch { }
  }, [id, isAuthenticated]);

  useEffect(() => {
    if (id) {
      fetchTrip(id);
    }
  }, [id, fetchTrip]);

  useEffect(() => {
    if (error && isUnauthorizedError(error)) {
      try { logError('trip_detail_unauthorized', { tripId: id }); } catch { }
    }
  }, [error, id]);

  // Auto-fetch hero image if missing
  useEffect(() => {
    if (trip && !trip.imageUrl && isAuthenticated) {
      apiRequest('POST', `/api/v1/trips/${id}/image`)
        .then(res => res.json())
        .then(data => {
          if (data.imageUrl) {
            setCurrentTrip({ ...trip, imageUrl: data.imageUrl, imageCaption: data.imageCaption });
          }
        })
        .catch(() => { });
    }
  }, [trip, id, isAuthenticated, setCurrentTrip]);

  const { data: journalEntries } = useQuery<JournalEntry[]>({
    queryKey: ['/api/v1/journal'],
  });

  const updateTripMutation = useMutation({
    mutationFn: async (updates: Partial<Trip>) => {
      const response = await apiRequest('PUT', `/api/v1/trips/${id}`, updates);
      return response.json();
    },
    onSuccess: () => {
      fetchTrip(id);
      queryClient.invalidateQueries({ queryKey: ['/api/v1/trips'] });
      toast({
        title: "Trip Updated",
        description: "Your trip has been updated successfully.",
      });
      setIsEditing(false);
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        try { logError('trip_update_unauthorized', { tripId: id }); } catch { }
      }
      toast({
        title: "Error",
        description: "Failed to update trip.",
        variant: "destructive",
      });
    },
  });

  const deleteTripMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', `/api/v1/trips/${id}`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/v1/trips'] });
      toast({
        title: "Trip Deleted",
        description: "Your trip has been deleted.",
      });
      setLocation('/app/home');
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete trip.",
        variant: "destructive",
      });
    },
  });

  const addActivityMutation = useMutation({
    mutationFn: async ({ dayIndex, activity }: { dayIndex: number; activity: any }) => {
      const response = await apiRequest('POST', `/api/v1/trips/${id}/itinerary/activity`, {
        dayIndex,
        activity
      });
      return response.json();
    },
    onSuccess: () => {
      fetchTrip(id);
      toast({ title: "Activity added", description: "Activity has been added to your itinerary." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add activity.", variant: "destructive" });
    }
  });

  const deleteActivityMutation = useMutation({
    mutationFn: async ({ dayIndex, activityId }: { dayIndex: number; activityId: string }) => {
      const response = await apiRequest('DELETE', `/api/v1/trips/${id}/itinerary/activity/${activityId}`, { dayIndex });
      return response.json();
    },
    onSuccess: () => {
      fetchTrip(id);
      toast({ title: "Activity deleted", description: "Activity has been removed from your itinerary." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete activity.", variant: "destructive" });
    }
  });

  const handleMapAddActivity = async (activity: any, dayNumber: number) => {
    addActivityMutation.mutate({ dayIndex: dayNumber - 1, activity });
  };

  const handleMapDeleteActivity = async (dayIndex: number, activityIndex: number) => {
    if (!trip?.itinerary || !Array.isArray(trip.itinerary)) return;
    const day = trip.itinerary[dayIndex];
    if (!day) return;
    if (!day || !day.activities || !day.activities[activityIndex]) return;
    const activity = day.activities[activityIndex];
    deleteActivityMutation.mutate({ dayIndex, activityId: activity.id });
  };

  useEffect(() => {
    if (trip) {
      setTripForm({
        origin: trip.origin || '',
        destination: trip.destination,
        budget: trip.budget?.toString() || '',
        days: trip.days.toString(),
        groupSize: trip.groupSize?.toString() || '',
        travelStyle: trip.travelStyle,
        status: trip.status as 'planning' | 'active' | 'completed',
        notes: trip.notes || ''
      });
      setAiBudget(trip.budget?.toString() || '');
      setAiGroupSize(trip.groupSize?.toString() || '');
      setAiNotes(trip.notes || '');
    }
  }, [trip]);

  const handleSave = () => {
    if (!tripForm.destination || !tripForm.days || !tripForm.groupSize || !tripForm.travelStyle) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    const updates = {
      origin: tripForm.origin,
      destination: tripForm.destination,
      budget: tripForm.budget ? parseFloat(tripForm.budget) : undefined,
      days: parseInt(tripForm.days),
      groupSize: parseInt(tripForm.groupSize),
      travelStyle: tripForm.travelStyle as 'budget' | 'standard' | 'luxury' | 'adventure' | 'relaxed' | 'family' | 'cultural' | 'culinary',
      status: tripForm.status,
      notes: tripForm.notes
    };

    updateTripMutation.mutate(updates);
  };

  const handleDelete = async () => {
    if (id) {
      await deleteTrip(id);
      setLocation('/app/home');
    }
  };

  const handleCancel = () => {
    if (trip) {
      setTripForm({
        origin: trip.origin || '',
        destination: trip.destination,
        budget: trip.budget?.toString() || '',
        days: trip.days.toString(),
        groupSize: trip.groupSize?.toString() || '',
        travelStyle: trip.travelStyle,
        status: trip.status as 'planning' | 'active' | 'completed',
        notes: trip.notes || ''
      });
    }
    setIsEditing(false);
  };

  const tripJournalEntries = journalEntries?.filter(entry => entry.tripId?.toString() === id) || [];
  const selectedStyle = travelStyles.find(style => style.id === tripForm.travelStyle);

  const generatePlanMutation = useMutation({
    mutationFn: async () => {
      const destination = String(tripForm.destination || '').trim();
      if (!destination) throw new Error('400:destination_required');
      // clear any stale toasts before starting a new run
      try { dismiss(); } catch { }
      setPlanStage('fetching');
      logInfo('plan_generate_start', { tripId: id, destination });
      const schema = z.object({
        query: z.string(),
        page: z.number(),
        pageSize: z.number(),
        total: z.number(),
        items: z.array(z.object({
          id: z.string(),
          name_en: z.string(),
          name_local: z.string(),
          transliteration: z.string(),
          road: z.string().optional(),
          city: z.string().optional(),
          country: z.string(),
          postcode: z.string().optional(),
          lat: z.number(),
          lon: z.number(),
          display_name: z.string(),
          source: z.string(),
        })),
      });
      const placesRes = await apiRequest('GET', `/api/v1/places/tourist-attractions?location=${encodeURIComponent(destination)}&pageSize=50`);
      const placesJson = await placesRes.json();
      const parsed = schema.safeParse(placesJson);
      if (!parsed.success) {
        logError('open_api_invalid_format', { destination, error: String(parsed.error?.message || parsed.error) });
        throw new Error('invalid_response_format');
      }
      const items = parsed.data.items;
      logInfo('open_api_success', { destination, count: items.length });
      const planning = items.map(i => ({
        id: i.id,
        title: i.name_en,
        coords: { lat: i.lat, lon: i.lon },
        address: [i.road, i.city, i.country, i.postcode].filter(Boolean).join(', '),
        displayName: i.display_name,
      }));
      setOpenApiLocations(items);
      setOpenApiPlanning(planning);
      setPlanStage('generating');
      const payload = {
        location: tripForm.destination,
        budget: aiBudget ? parseFloat(aiBudget) : (trip?.budget ?? undefined),
        people: aiGroupSize ? parseInt(aiGroupSize) : (trip?.groupSize ? parseInt(trip.groupSize.toString()) : undefined),
        notes: aiNotes || tripForm.notes || undefined,
        days: parseInt(tripForm.days),
        travelStyle: tripForm.travelStyle,
        transportMode: trip?.transportMode || undefined,
      };
      const makeRequest = async () => {
        const response = await apiRequest('POST', `/api/v1/trips/${id}/ai-plan`, payload);
        const json = await response.json();
        logInfo('ai_plan_success', { tripId: id, destination });
        return json;
      };

      try {
        return await makeRequest();
      } catch (error) {
        throw error;
      }
    },
    onSuccess: (data: any) => {
      setPlanStage('done');
      const already = !!(data && (data as any).__alreadyGenerated);
      if (!already) {
        fetchTrip(id);
      }
      try { dismiss(); activeToastId.current = null; } catch { }
      toast({ title: already ? 'Plan Already Generated' : 'AI Plan Generated', description: already ? 'Your existing plan is shown below.' : 'Your plan has been added below.' });
      try {
        const el = document.querySelector('.prose.prose-invert');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch { }
    },
    onError: (error) => {
      setPlanStage('error');
      if (isUnauthorizedError(error)) {
        try { logError('plan_generate_unauthorized', { tripId: id }); } catch { }
      }
      const msg = String((error as any)?.message || '');
      if (msg === 'invalid_response_format') {
        const t = toast({ title: 'Invalid Response', description: 'The location data received was not in the expected format.', variant: 'destructive' });
        activeToastId.current = t.id;
        return;
      }
      if (/^400:/.test(msg)) {
        const desc = msg.split(':').slice(1).join(':').trim() || 'Invalid input. Please review the fields and try again.';
        const t = toast({ title: 'Invalid Input', description: desc, variant: 'destructive' });
        activeToastId.current = t.id;
        return;
      }
      if (/^429:/.test(msg)) {
        const desc = msg.split(':').slice(1).join(':').trim() || 'Too many requests. Please wait a moment and try again.';
        const t = toast({ title: 'Rate Limited', description: desc, variant: 'destructive' });
        activeToastId.current = t.id;
        return;
      }
      const t = toast({ title: 'Error', description: msg || 'Failed to generate plan.', variant: 'destructive' });
      activeToastId.current = t.id;
      logError('plan_generate_error', { tripId: id, message: msg });
    }
  });


  const hasTripError = !!error && !tripLoading && !trip;
  if (hasTripError) {
    return (
      <div className=" flex items-center justify-center">
        <Card className="bg-card border-border max-w-md">
          <CardContent className="p-8 text-center">
            <div className="text-red-500 mb-4">
              <i className="fas fa-exclamation-triangle text-5xl"></i>
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">Trip Not Found</h2>
            <p className="text-muted-foreground mb-4">The trip you're looking for doesn't exist or you don't have access to it.</p>
            <Link href="/">
              <Button className="bg-[#1D4E89] hover:bg-[#1D4E89] ">
                Go Back Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (tripLoading) {
    return (
      <div className="">

        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1D4E89] mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading trip details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!trip) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation Header */}


      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 pb-24">
        {/* Trip Header */}
        <div className="mb-4">
          <div className="flex flex-col md:flex-row md:items-start justify-between mb-4 gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2" data-testid="trip-title">
                {trip.destination}
              </h1>
              <div className="flex flex-wrap items-center gap-2 md:gap-4 text-sm md:text-base text-muted-foreground">
                {trip.origin && (
                  <>
                    <span>from {trip.origin}</span>
                    <span>•</span>
                  </>
                )}
                <span>{trip.days} {Number(trip.days) === 1 ? 'day' : 'days'}</span>
                <span>•</span>
                <span>₹{trip.budget} budget</span>
                <span>•</span>
                <span className="capitalize">
                  {(String(trip.groupSize || 'Solo')).replace('-', ' ')}
                  {/^\d+$/.test(String(trip.groupSize)) ? (Number(trip.groupSize) === 1 ? ' traveler' : ' travelers') : ''}
                </span>
              </div>
            </div>
            <AnimatePresence>
              {isAtlasThinking && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center space-x-2 bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-full"
                >
                  <div className="flex space-x-1">
                    <motion.div
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.5, repeat: Infinity, delay: 0 }}
                      className="w-1.5 h-1.5 bg-[#1D4E89] rounded-full"
                    />
                    <motion.div
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
                      className="w-1.5 h-1.5 bg-[#1D4E89] rounded-full"
                    />
                    <motion.div
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.5, repeat: Infinity, delay: 0.4 }}
                      className="w-1.5 h-1.5 bg-[#1D4E89] rounded-full"
                    />
                  </div>
                  <span className="text-xs font-medium text-[#1D4E89]">Atlas is thinking...</span>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="flex items-center gap-2 self-start">
              <Badge className={`${statusColors[trip?.status as keyof typeof statusColors] || 'bg-muted-foreground'} text-white`}>
                {trip?.status ? (trip.status.charAt(0).toUpperCase() + trip.status.slice(1)) : 'Planning'}
              </Badge>
              {!isEditing && (
                <div className="flex space-x-2">
                  {id && trip && (
                    <div className="flex items-center space-x-4">
                      <PresenceBubbles tripId={id} />
                      <CollaboratorManager tripId={id} ownerId={trip.userId} />
                    </div>
                  )}
                  <Button
                    onClick={() => setIsEditing(true)}
                    variant="outline"
                    size="sm"
                    className="bg-muted/50 border text-foreground hover:bg-card "
                    data-testid="button-edit-trip"
                  >
                    <i className="fas fa-edit md:mr-2"></i>
                    <span className="hidden md:inline">Edit</span>
                  </Button>
                  <Button
                    onClick={handleDelete}
                    variant="outline"
                    size="sm"
                    className="bg-muted/50 border-red-400 text-red-500 hover:bg-red-500 hover:text-white "
                    data-testid="button-delete-trip"
                  >
                    <i className="fas fa-trash md:mr-2"></i>
                    <span className="hidden md:inline">Delete</span>
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Hero Image */}
          <div className="relative rounded-xl overflow-hidden w-full aspect-video md:aspect-auto md:h-80 bg-muted/50 flex items-center justify-center group">
            {trip.imageUrl && !heroImgError ? (
              <>
                <img
                  src={trip.imageUrl}
                  alt={trip.destination}
                  onError={() => setHeroImgError(true)}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent"></div>

                {(trip as any).imageCaption && (
                  <div className="absolute bottom-4 left-4 z-10">
                    <div className="bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-2">
                       <i className="fas fa-camera text-[#1D4E89] text-xs"></i>
                       <span className="text-white text-xs font-medium tracking-wide drop-shadow-sm">{(trip as any).imageCaption}</span>
                    </div>
                  </div>
                )}

                {/* Image refresh button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-4 right-4 z-20 text-white/70 hover:text-white bg-black/40 hover:bg-black/60 backdrop-blur-md transition-all rounded-full border border-white/10"
                  onClick={async (e) => {
                    e.stopPropagation();
                    toast({ title: "Refreshing image...", description: "Looking for a better photo." });
                    try {
                      const res = await apiRequest('POST', `/api/v1/trips/${id}/image?force=true`);
                      const data = await res.json();
                      if (data?.imageUrl && trip) {
                        setCurrentTrip({ ...trip, imageUrl: data.imageUrl, imageCaption: data.imageCaption });
                        toast({ title: "Image updated!", description: "Found a new photo." });
                      } else {
                        toast({ title: "No better photo found", description: "Couldn't find a new photo for this destination.", variant: "destructive" });
                      }
                    } catch (err) {
                      toast({ title: "Failed to refresh", variant: "destructive" });
                    }
                  }}
                  title="Refresh Image"
                >
                  <i className="fas fa-sync-alt animate-hover-spin"></i>
                </Button>
              </>
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-[#1D4E89] to-purple-600 transition-opacity"></div>
            )}

            {/* Text overlay removed to prevent duplication with the main header */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent"></div>
          </div>
        </div>


        {/* Edit Form */}
        {isEditing && (
          <Card className="bg-card border-border mb-8">
            <CardHeader>
              <CardTitle className="text-xl font-bold text-foreground">Edit Trip Details</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-6" data-testid="trip-edit-form">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">
                      Starting Location
                    </label>
                    <Input
                      type="text"
                      value={tripForm.origin}
                      onChange={(e) => setTripForm(prev => ({ ...prev, origin: e.target.value }))}
                      className="bg-muted/50 border text-foreground"
                      placeholder="Where are you traveling from?"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">
                      Destination <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="text"
                      value={tripForm.destination}
                      onChange={(e) => setTripForm(prev => ({ ...prev, destination: e.target.value }))}
                      className="bg-muted/50 border text-foreground"
                      data-testid="input-edit-destination"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">Budget (INR)</label>
                    <Input
                      type="number"
                      value={tripForm.budget}
                      onChange={(e) => setTripForm(prev => ({ ...prev, budget: e.target.value }))}
                      className="bg-muted/50 border text-foreground"
                      data-testid="input-edit-budget"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">
                      Trip Duration <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Input
                        type="number"
                        min="1"
                        value={tripForm.days}
                        onChange={(e) => setTripForm(prev => ({ ...prev, days: e.target.value }))}
                        className="bg-muted/50 border text-foreground pr-12"
                        data-testid="input-edit-duration"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        {Number(tripForm.days) === 1 ? 'day' : 'days'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">Status</label>
                    <Select
                      value={tripForm.status}
                      onValueChange={(value: 'planning' | 'active' | 'completed') => setTripForm(prev => ({ ...prev, status: value }))}
                    >
                      <SelectTrigger
                        className="bg-muted/50 border text-foreground"
                        data-testid="select-edit-status"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-muted/50 border">
                        <SelectItem value="planning" className="text-white hover:bg-card">Planning</SelectItem>
                        <SelectItem value="active" className="text-white hover:bg-card">Active</SelectItem>
                        <SelectItem value="completed" className="text-white hover:bg-card">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">Notes</label>
                  <Textarea
                    value={tripForm.notes}
                    onChange={(e) => setTripForm(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Add any notes about your trip..."
                    className="bg-muted/50 border text-foreground placeholder:text-muted-foreground min-h-[100px]"
                    data-testid="textarea-edit-notes"
                  />
                </div>

                <div className="flex space-x-4">
                  <Button
                    type="button"
                    onClick={handleCancel}
                    variant="outline"
                    className="flex-1 bg-muted/50 border text-foreground hover:bg-card "
                    data-testid="button-cancel-edit"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSave}
                    disabled={updateTripMutation.isPending}
                    className="flex-1 bg-[#1D4E89] hover:bg-[#1D4E89] "
                    data-testid="button-save-trip"
                  >
                    {updateTripMutation.isPending ? (
                      <>
                        <i className="fas fa-spinner fa-spin mr-2"></i>
                        Saving...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-save mr-2"></i>
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Trip Content — Tabbed */}
        <Tabs defaultValue="overview" className="space-y-0">
          <TabsList className="flex w-full bg-muted/50 rounded-xl mb-6 p-1 h-auto gap-0.5 overflow-x-auto">
            <TabsTrigger value="overview"   className="flex-1 min-w-[80px] rounded-lg text-xs font-semibold data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm py-2">
              <i className="fas fa-compass mr-1.5" />Overview
            </TabsTrigger>
            <TabsTrigger value="itinerary"  className="flex-1 min-w-[80px] rounded-lg text-xs font-semibold data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm py-2">
              <i className="fas fa-route mr-1.5" />Itinerary
            </TabsTrigger>
            <TabsTrigger value="map"        className="flex-1 min-w-[80px] rounded-lg text-xs font-semibold data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm py-2">
              <i className="fas fa-map-marked-alt mr-1.5" />Map
            </TabsTrigger>
            <TabsTrigger value="budget"     className="flex-1 min-w-[80px] rounded-lg text-xs font-semibold data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm py-2">
              <i className="fas fa-wallet mr-1.5" />Budget
            </TabsTrigger>
            <TabsTrigger value="places"     className="flex-1 min-w-[80px] rounded-lg text-xs font-semibold data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm py-2">
              <i className="fas fa-search-location mr-1.5" />Places
            </TabsTrigger>
          </TabsList>

          {/* ── Overview tab ─────────────────────────────────── */}
          <TabsContent value="overview" className="space-y-6 mt-0">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-xl font-bold text-foreground">Trip Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-muted/50 rounded-xl">
                  <i className="fas fa-calendar text-[#1D4E89] text-xl mb-2"></i>
                  <p className="text-sm text-muted-foreground">Duration</p>
                  <p className="font-bold text-foreground">{trip.days} days</p>
                </div>
                <div className="text-center p-4 bg-muted/50 rounded-xl">
                  <i className="fas fa-rupee-sign text-emerald-500 text-xl mb-2"></i>
                  <p className="text-sm text-muted-foreground">Budget</p>
                  <p className="font-bold text-foreground">
                    {(() => {
                      const symbols: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AUD: 'A$', CAD: 'C$', JPY: '¥', CNY: '¥' };
                      const symbol = symbols[trip.currency || 'INR'] || trip.currency || '₹';
                      return `${symbol}${trip.budget}`;
                    })()}
                  </p>
                </div>
                <div className="text-center p-4 bg-muted/50 rounded-xl">
                  <i className="fas fa-users text-amber-500 text-xl mb-2"></i>
                  <p className="text-sm text-muted-foreground">Group</p>
                  <p className="font-bold text-foreground capitalize">{String(trip.groupSize).replace('-', ' ')}</p>
                </div>
                <div className="text-center p-4 bg-muted/50 rounded-xl">
                  {selectedStyle && <selectedStyle.icon className={`${selectedStyle.color} w-6 h-6 mb-2 mx-auto`} />}
                  <p className="text-sm text-muted-foreground">Style</p>
                  <p className="font-bold text-foreground capitalize">{(trip.travelStyle || 'standard').replace('-', ' ')}</p>
                </div>
                <div className="text-center p-4 bg-muted/50 rounded-xl">
                  {weather?.current ? (
                    <>
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <i className={`${weather.current.icon || getWeatherIcon(weather.current.condition)} text-2xl`}></i>
                      </div>
                      <p className="text-sm text-muted-foreground">{weather.current.condition}</p>
                      <p className="font-bold text-foreground">{Math.round(weather.current.temperature)}°C</p>
                    </>
                  ) : weatherLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#1D4E89] mx-auto mb-2"></div>
                      <p className="text-sm text-muted-foreground">Weather</p>
                      <p className="font-bold text-foreground text-xs">Loading...</p>
                    </>
                  ) : (
                    <>
                      <i className="fas fa-exclamation-circle text-muted-foreground text-xl mb-2"></i>
                      <p className="text-sm text-muted-foreground">Weather</p>
                      <p className="font-bold text-muted-foreground text-xs">Unavailable</p>
                    </>
                  )}
                </div>
                {trip.transportMode && (
                  <div className="text-center p-4 bg-muted/50 rounded-xl">
                    <i className={`${trip.transportMode === 'flight' ? 'fas fa-plane' : trip.transportMode === 'train' ? 'fas fa-train' : trip.transportMode === 'bus' ? 'fas fa-bus' : trip.transportMode === 'car' ? 'fas fa-car-side' : 'fas fa-ship'} text-[#1D4E89] text-xl mb-2`}></i>
                    <p className="text-sm text-muted-foreground">Transport</p>
                    <p className="font-bold text-foreground capitalize">{trip.transportMode}</p>
                  </div>
                )}
              </div>

              {tripForm.notes && (
                <div className="mt-6">
                  <h4 className="font-semibold text-foreground mb-2">Notes</h4>
                  <p className="text-muted-foreground bg-muted/50 rounded-xl p-4">{tripForm.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Travel Smart Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Travel Hacks */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-xl font-bold text-foreground flex items-center gap-2">
                  <i className="fas fa-lightbulb text-amber-500"></i>
                  Travel Hacks & Savvy Tips
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {hacks?.hacks?.map((hack: string, i: number) => (
                    <div key={i} className="flex gap-3 text-sm text-muted-foreground">
                      <div className="text-amber-500 pt-1">•</div>
                      <div>{hack}</div>
                    </div>
                  ))}
                  {(!hacks || hacks.hacks?.length === 0) && <p className="text-muted-foreground italic text-sm">Fetching smart tips...</p>}
                </div>
                {hacks?.economicalAlternatives?.length > 0 && (
                  <div className="mt-6">
                    <h4 className="text-sm font-bold text-foreground mb-3">Economical Alternatives</h4>
                    <div className="space-y-2">
                      {hacks.economicalAlternatives.map((alt: string, i: number) => (
                        <div key={i} className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-xs text-emerald-400">
                          <i className="fas fa-wallet mr-2"></i>
                          {alt}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quiet Alternatives */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-xl font-bold text-foreground flex items-center gap-2">
                  <i className="fas fa-leaf text-emerald-500"></i>
                  Escape the Crowds
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {quietPlaces?.spots?.map((spot: any, i: number) => (
                    <div key={i} className="border-b border-border pb-4 last:border-0 last:pb-0">
                      <div className="font-bold text-foreground text-sm mb-1">{spot.name}</div>
                      <div className="text-xs text-muted-foreground mb-2">{spot.address}</div>

                      <div className="flex flex-wrap gap-2 mb-2">
                        {spot.crowdLevel && (
                          <Badge variant="outline" className="text-xs bg-green-900/20 text-green-400 border-green-900/50">
                            <i className="fas fa-users-slash mr-1"></i> {spot.crowdLevel} Crowds
                          </Badge>
                        )}
                        {spot.type && (
                          <Badge variant="outline" className="text-xs bg-blue-900/20 text-blue-400 border-blue-900/50">
                            {spot.type}
                          </Badge>
                        )}
                        {spot.bestTime && (
                          <Badge variant="outline" className="text-xs bg-orange-900/20 text-orange-400 border-orange-900/50">
                            <i className="fas fa-clock mr-1"></i> {spot.bestTime}
                          </Badge>
                        )}
                      </div>

                      <div className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 p-2 rounded-lg">
                        <i className="fas fa-info-circle mr-2"></i>
                        {spot.reason}
                      </div>
                    </div>
                  ))}
                  {(!quietPlaces?.spots || quietPlaces.spots.length === 0) && (
                    <p className="text-muted-foreground italic text-sm">
                      {quietLoading ? "Discovery in progress..." : "No quiet spots found for this area."}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          </TabsContent>

          {/* ── Itinerary tab ─────────────────────────────────── */}
          <TabsContent value="itinerary" className="mt-0">
            <ItineraryManager trip={trip} />
          </TabsContent>

          {/* ── Map tab ─────────────────────────────────── */}
          <TabsContent value="map" className="mt-0">
            <TripMap
              destination={trip.destination}
              itinerary={Array.isArray(trip.itinerary) ? trip.itinerary : []}
              origin={trip.origin}
              onAddActivity={handleMapAddActivity}
              onDeleteActivity={handleMapDeleteActivity}
            />
          </TabsContent>

          {/* ── Budget tab ─────────────────────────────────── */}
          <TabsContent value="budget" className="mt-0">
            <BudgetTracker trip={trip} />
          </TabsContent>

          {/* ── Places tab ─────────────────────────────────── */}
          <TabsContent value="places" className="mt-0">
          <div id="suggested-places-section" className="space-y-6">
            <div className="flex flex-col items-center gap-4">
              <h3 className="text-white font-semibold text-lg flex items-center gap-2">
                <i className="fas fa-map-marked-alt text-[#1D4E89]"></i>
                What are you looking for at your destination?
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-lg mx-auto">
                <Button
                  onClick={() => setShowHotels(!showHotels)}
                  variant={showHotels ? "default" : "outline"}
                  className={` h-12 ${showHotels ? 'bg-[#1D4E89] text-white hover:bg-[#1D4E89]/90' : 'bg-muted/50 border text-muted-foreground hover:text-white'}`}
                >
                  <i className="fas fa-bed mr-2"></i>
                  Hotels
                </Button>
                <Button
                  onClick={() => setShowRestaurants(!showRestaurants)}
                  variant={showRestaurants ? "default" : "outline"}
                  className={` h-12 ${showRestaurants ? 'bg-emerald-500 text-white hover:bg-emerald-500/90' : 'bg-muted/50 border text-muted-foreground hover:text-white'}`}
                >
                  <i className="fas fa-utensils mr-2"></i>
                  Restaurants
                </Button>
                <Button
                  onClick={() => setShowSpots(!showSpots)}
                  variant={showSpots ? "default" : "outline"}
                  className={` h-12 ${showSpots ? 'bg-amber-500 text-white hover:bg-amber-500/90' : 'bg-muted/50 border text-muted-foreground hover:text-white'}`}
                >
                  <i className="fas fa-camera mr-2"></i>
                  Tourist Spots
                </Button>
              </div>
            </div>

            {(showHotels || showRestaurants || showSpots) && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <Card className="bg-card border-border">
                  <CardHeader>
                    <CardTitle className="text-white text-base">Suggested Places</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(hotelsLoading || foodLoading || sightsLoading) && !(hotelResults || foodResults || sightsResults) ? (
                      <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D4E89]"></div>
                      </div>
                    ) : (
                      <div className={`grid gap-6 ${[showHotels, showRestaurants, showSpots].filter(Boolean).length === 1
                        ? 'grid-cols-1'
                        : [showHotels, showRestaurants, showSpots].filter(Boolean).length === 2
                          ? 'grid-cols-1 sm:grid-cols-2'
                          : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                        }`}>
                        {/* Hotels */}
                        {showHotels && (
                          <div>
                            <div className="flex items-center gap-2 mb-3 text-foreground font-semibold border-b border pb-2">
                              <i className="fas fa-bed text-[#1D4E89]"></i> Hotels
                            </div>
                            <div className="space-y-3">
                              {hotelsLoading ? (
                                <div className="text-muted-foreground text-xs">Loading hotels...</div>
                              ) : (
                                <>
                                  {(hotelResults || []).slice(0, 5).map((i: any) => (
                                    <div key={`h-${i.id}`} className="text-sm text-white bg-muted/50 rounded-xl p-3 hover:bg-muted/50 transition-colors">
                                      <div className="font-semibold">{String(i.name || i.title || i.name_en || i.name_local || i.display_name?.split(',')[0] || 'Unknown Place')}</div>
                                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{String(i.address || (i.display_name?.includes(',') ? i.display_name.split(',').slice(1).join(',').trim() : i.display_name) || '')}</div>
                                      <a href={`https://www.google.com/maps/search/?api=1&query=${i.lat && i.lon ? `${i.lat},${i.lon}` : encodeURIComponent(String(i.display_name || ''))}`} target="_blank" rel="noreferrer" className="text-xs text-[#1D4E89] hover:underline mt-2 inline-flex items-center">
                                        Open Map <i className="fas fa-external-link-alt ml-1 text-[10px]"></i>
                                      </a>
                                    </div>
                                  ))}
                                  {(!hotelResults || hotelResults.length === 0) && <div className="text-muted-foreground text-xs italic">No hotels found</div>}
                                </>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Restaurants */}
                        {showRestaurants && (
                          <div>
                            <div className="flex items-center gap-2 mb-3 text-foreground font-semibold border-b border pb-2">
                              <i className="fas fa-utensils text-emerald-500"></i> Restaurants
                            </div>
                            <div className="space-y-3">
                              {foodLoading ? (
                                <div className="text-muted-foreground text-xs">Loading restaurants...</div>
                              ) : (
                                <>
                                  {(foodResults || []).slice(0, 5).map((i: any) => (
                                    <div key={`f-${i.id}`} className="text-sm text-white bg-muted/50 rounded-xl p-3 hover:bg-muted/50 transition-colors">
                                      <div className="font-semibold">{String(i.name || i.title || i.name_en || i.name_local || i.display_name?.split(',')[0] || 'Unknown Place')}</div>
                                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{String(i.address || (i.display_name?.includes(',') ? i.display_name.split(',').slice(1).join(',').trim() : i.display_name) || '')}</div>
                                      <a href={`https://www.google.com/maps/search/?api=1&query=${i.lat && i.lon ? `${i.lat},${i.lon}` : encodeURIComponent(String(i.display_name || ''))}`} target="_blank" rel="noreferrer" className="text-xs text-[#1D4E89] hover:underline mt-2 inline-flex items-center">
                                        Open Map <i className="fas fa-external-link-alt ml-1 text-[10px]"></i>
                                      </a>
                                    </div>
                                  ))}
                                  {(!foodResults || foodResults.length === 0) && <div className="text-muted-foreground text-xs italic">No restaurants found</div>}
                                </>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Tourist Spots */}
                        {showSpots && (
                          <div>
                            <div className="flex items-center gap-2 mb-3 text-foreground font-semibold border-b border pb-2">
                              <i className="fas fa-camera text-amber-500"></i> Tourist Spots
                            </div>
                            <div className="space-y-3">
                              {sightsLoading ? (
                                <div className="text-muted-foreground text-xs">Loading spots...</div>
                              ) : (
                                <>
                                  {(sightsResults || []).slice(0, 5).map((i: any) => (
                                    <div key={`s-${i.id}`} className="text-sm text-white bg-muted/50 rounded-xl p-3 hover:bg-muted/50 transition-colors">
                                      <div className="font-semibold">{String(i.name || i.title || i.name_en || i.name_local || i.display_name?.split(',')[0] || 'Unknown Place')}</div>
                                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{String(i.address || (i.display_name?.includes(',') ? i.display_name.split(',').slice(1).join(',').trim() : i.display_name) || '')}</div>
                                      <a
                                        href={`https://www.google.com/maps/search/?api=1&query=${i.lat && i.lon ? `${i.lat},${i.lon}` : encodeURIComponent(String(i.display_name || ''))}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-xs text-[#1D4E89] hover:underline mt-2 inline-flex items-center"
                                        onClick={() => {
                                          try { logInfo('place_open_map', { id: String(i.id), type: 'tourist_spot', lat: Number(i.lat), lon: Number(i.lon), name: String(i.name_en || i.name_local || i.display_name || '') }); } catch { }
                                        }}
                                      >
                                        Open Map <i className="fas fa-external-link-alt ml-1 text-[10px]"></i>
                                      </a>
                                    </div>
                                  ))}
                                  {(!sightsResults || sightsResults.length === 0) && <div className="text-muted-foreground text-xs italic">No spots found</div>}
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>
          </TabsContent>

        </Tabs>

        {/* Journal Entries — always shown below tabs */}
        {tripJournalEntries.length > 0 && (
          <Card className="bg-card border-border mt-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-bold text-foreground">Trip Journal</CardTitle>
                <div className="flex items-center gap-2">
                  <RecapPanel
                    tripId={id!}
                    destination={trip.destination}
                    entryCount={tripJournalEntries.length}
                    onRecapSaved={() => queryClient.invalidateQueries({ queryKey: ['/api/v1/journal'] })}
                    recapJournalEntry={tripJournalEntries.find(e => e.type === 'recap')}
                  />
                  <Link href="/app/journal">
                    <Button variant="outline" size="sm" className="bg-muted/50 border text-foreground hover:bg-card">
                      View All
                    </Button>
                  </Link>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {tripJournalEntries.slice(0, 3).map((entry) => (
                  <div key={entry.id} className="bg-muted/50 rounded-xl p-4">
                    <h4 className="font-bold text-white mb-2">{entry.title}</h4>
                    <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{entry.content}</p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{entry.location}</span>
                      <span>{new Date(entry.createdAt!).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div >
  );
}
