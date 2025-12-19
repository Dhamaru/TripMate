import { useState } from "react";
import { Mountain, Armchair, Landmark, Utensils } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TripMateLogo } from "@/components/TripMateLogo";
import { motion } from "framer-motion";
import { PackingList } from "@/components/PackingList";
import { TripMap } from "@/components/TripMap";
import { BudgetTracker } from "@/components/budget/BudgetTracker";
import { ItineraryManager } from "@/components/itinerary/ItineraryManager";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useRef } from "react";
import { apiRequest } from "@/lib/queryClient";
import { z } from "zod";
import { logInfo, logError } from "@/lib/logger";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Link, useParams, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useMemo } from "react";
import type { Trip, JournalEntry, User } from "@shared/schema";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import ReactMarkdown from "react-markdown";

const travelStyles = [
  { id: 'adventure', icon: Mountain, name: 'Adventure', color: 'text-ios-blue' },
  { id: 'relaxed', icon: Armchair, name: 'Relaxed', color: 'text-ios-orange' },
  { id: 'cultural', icon: Landmark, name: 'Cultural', color: 'text-ios-blue' },
  { id: 'culinary', icon: Utensils, name: 'Culinary', color: 'text-ios-green' }
];

const statusColors = {
  planning: 'bg-ios-orange',
  active: 'bg-ios-green',
  completed: 'bg-ios-gray'
};

export default function TripDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth() as { user: User | undefined; isLoading: boolean; isAuthenticated: boolean };
  const { toast, dismiss } = useToast();
  const activeToastId = useRef<string | null>(null);
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [tripForm, setTripForm] = useState({
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
  const [openApiLocations, setOpenApiLocations] = useState<Array<{ id: string; name_en: string; name_local: string; transliteration: string; road?: string; city?: string; country: string; postcode?: string; lat: number; lon: number; display_name: string; source: string }>>([]);
  const [openApiPlanning, setOpenApiPlanning] = useState<Array<{ id: string; title: string; coords: { lat: number; lon: number }; address: string; displayName: string }>>([]);

  useEffect(() => {
    if (planStage === 'fetching' || planStage === 'generating' || planStage === 'done') {
      try { dismiss(); activeToastId.current = null; } catch { }
    }
  }, [planStage]);

  const { data: hotelResults } = useQuery<any>({
    queryKey: ['places_hotels', id, tripForm.destination],
    enabled: !!tripForm.destination,
    queryFn: async () => {
      const r = await apiRequest('GET', `/api/v1/places/search?query=${encodeURIComponent('hotels near ' + String(tripForm.destination || ''))}&pageSize=10`);
      const j = await r.json();
      return Array.isArray(j?.items) ? j.items : [];
    },
  });

  const { data: foodResults } = useQuery<any>({
    queryKey: ['places_food', id, tripForm.destination],
    enabled: !!tripForm.destination,
    queryFn: async () => {
      const r = await apiRequest('GET', `/api/v1/places/search?query=${encodeURIComponent('restaurants near ' + String(tripForm.destination || ''))}&pageSize=10`);
      const j = await r.json();
      return Array.isArray(j?.items) ? j.items : [];
    },
  });

  const { data: sightsResults } = useQuery<any>({
    queryKey: ['places_sights', id, tripForm.destination],
    enabled: !!tripForm.destination,
    queryFn: async () => {
      const r = await apiRequest('GET', `/api/v1/places/tourist-attractions?location=${encodeURIComponent(String(tripForm.destination || ''))}&pageSize=10`);
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

  const { data: trip, isLoading: tripLoading, error } = useQuery<Trip>({
    queryKey: ['/api/v1/trips', id],
    enabled: !!id,
  });

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
            queryClient.setQueryData(['/api/v1/trips', id], (old: Trip | undefined) => old ? { ...old, imageUrl: data.imageUrl } : old);
          }
        })
        .catch(() => { });
    }
  }, [trip, id, isAuthenticated, queryClient]);

  const { data: journalEntries } = useQuery<JournalEntry[]>({
    queryKey: ['/api/v1/journal'],
  });

  const updateTripMutation = useMutation({
    mutationFn: async (updates: Partial<Trip>) => {
      const response = await apiRequest('PUT', `/api/v1/trips/${id}`, updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/v1/trips', id] });
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

  useEffect(() => {
    if (trip) {
      console.log('Trip Details Loaded:', trip);
      console.log('Trip Itinerary Type:', Array.isArray(trip.itinerary) ? 'Array' : typeof trip.itinerary);
      console.log('Trip Itinerary Length:', Array.isArray(trip.itinerary) ? trip.itinerary.length : 'N/A');

      setTripForm({
        destination: trip.destination,
        budget: trip.budget?.toString() || '',
        days: trip.days.toString(),
        groupSize: trip.groupSize.toString(),
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

  const handleDelete = () => {
    // Removed confirm for debugging/user request
    console.log('Deleting trip...');
    deleteTripMutation.mutate();
  };

  const handleCancel = () => {
    if (trip) {
      setTripForm({
        destination: trip.destination,
        budget: trip.budget?.toString() || '',
        days: trip.days.toString(),
        groupSize: trip.groupSize.toString(),
        travelStyle: trip.travelStyle,
        status: trip.status as 'planning' | 'active' | 'completed',
        notes: (trip.itinerary as any)?.notes || ''
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
        people: aiGroupSize ? parseInt(aiGroupSize) : (trip?.groupSize ?? undefined),
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
        if (isUnauthorizedError(error)) {
          try {
            const refreshRes = await fetch("/api/v1/auth/refresh", { method: "POST", credentials: "include" });
            if (refreshRes.ok) {
              const data = await refreshRes.json();
              if (data.token) {
                (window as any).__authToken = data.token;
                return await makeRequest();
              }
            }
          } catch {
            // Refresh failed, throw original error
          }
        }
        throw error;
      }
    },
    onSuccess: (data: any) => {
      setPlanStage('done');
      const already = !!(data && (data as any).__alreadyGenerated);
      if (!already) {
        queryClient.invalidateQueries({ queryKey: ['/api/v1/trips', id] });
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
      <div className="min-h-screen bg-ios-darker flex items-center justify-center">
        <Card className="bg-card border-border max-w-md">
          <CardContent className="p-8 text-center">
            <div className="text-ios-red mb-4">
              <i className="fas fa-exclamation-triangle text-5xl"></i>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Trip Not Found</h2>
            <p className="text-ios-gray mb-4">The trip you're looking for doesn't exist or you don't have access to it.</p>
            <Link href="/">
              <Button className="bg-ios-blue hover:bg-ios-blue smooth-transition interactive-tap radius-md">
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
      <div className="min-h-screen bg-ios-darker">

        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ios-blue mx-auto mb-4"></div>
            <p className="text-ios-gray">Loading trip details...</p>
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
              <h1 className="text-2xl md:text-3xl font-bold text-white mb-2" data-testid="trip-title">
                {trip.destination}
              </h1>
              <div className="flex flex-wrap items-center gap-2 md:gap-4 text-sm md:text-base text-ios-gray">
                <span>{trip.days} {Number(trip.days) === 1 ? 'day' : 'days'}</span>
                <span>•</span>
                <span>₹{trip.budget} budget</span>
                <span>•</span>
                <span className="capitalize">
                  {String(trip.groupSize).replace('-', ' ')}
                  {/^\d+$/.test(String(trip.groupSize)) ? (Number(trip.groupSize) === 1 ? ' traveler' : ' travelers') : ''}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 self-start">
              <Badge className={`${statusColors[trip.status as keyof typeof statusColors] || 'bg-ios-gray'} text-white`}>
                {trip.status.charAt(0).toUpperCase() + trip.status.slice(1)}
              </Badge>
              {!isEditing && (
                <div className="flex space-x-2">
                  <Button
                    onClick={() => setIsEditing(true)}
                    variant="outline"
                    size="sm"
                    className="bg-ios-darker border-border text-white hover:bg-card smooth-transition interactive-tap radius-md"
                    data-testid="button-edit-trip"
                  >
                    <i className="fas fa-edit md:mr-2"></i>
                    <span className="hidden md:inline">Edit</span>
                  </Button>
                  <Button
                    onClick={handleDelete}
                    variant="outline"
                    size="sm"
                    className="bg-ios-darker border-ios-red text-ios-red hover:bg-ios-red hover:text-white smooth-transition interactive-tap radius-md"
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
          <div className="relative radius-md overflow-hidden h-48 md:h-64 bg-secondary flex items-center justify-center group">
            {trip.imageUrl ? (
              <>
                <img
                  src={trip.imageUrl}
                  alt={trip.destination}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent"></div>
              </>
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-ios-blue to-purple-600 transition-opacity"></div>
            )}

            <div className="relative text-center text-white z-10 px-4 group/text">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-[-2rem] right-0 text-white/50 hover:text-white hover:bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  // Trigger image refresh
                  fetch(`/api/v1/trips/${trip._id}/image?force=true`, { method: 'POST' })
                    .then(res => res.json())
                    .then(data => {
                      if (data.imageUrl) window.location.reload(); // Simple reload for now to reflect change
                    });
                }}
                title="Refresh Image"
              >
                <i className="fas fa-sync-alt"></i>
              </Button>

              {selectedStyle && (
                <selectedStyle.icon className={`${selectedStyle.color} w-12 h-12 md:w-16 md:h-16 mb-2 md:mb-4 opacity-80 mx-auto drop-shadow-lg`} />
              )}
              <h2 className="text-3xl md:text-4xl font-bold mb-2 shadow-text">{trip.destination}</h2>
              <p className="text-lg md:text-xl font-medium opacity-90 capitalize shadow-text flex items-center justify-center gap-2">
                {trip.travelStyle.replace('-', ' ')} Adventure
              </p>
            </div>
          </div>
        </div>


        {/* Edit Form */}
        {isEditing && (
          <Card className="bg-card border-border mb-8">
            <CardHeader>
              <CardTitle className="text-xl font-bold text-white">Edit Trip Details</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-6" data-testid="trip-edit-form">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-white mb-2">
                      Destination <span className="text-ios-red">*</span>
                    </label>
                    <Input
                      type="text"
                      value={tripForm.destination}
                      onChange={(e) => setTripForm(prev => ({ ...prev, destination: e.target.value }))}
                      className="bg-ios-darker border-border text-white"
                      data-testid="input-edit-destination"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-white mb-2">Budget (INR)</label>
                    <Input
                      type="number"
                      value={tripForm.budget}
                      onChange={(e) => setTripForm(prev => ({ ...prev, budget: e.target.value }))}
                      className="bg-ios-darker border-border text-white"
                      data-testid="input-edit-budget"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-white mb-2">
                      Trip Duration <span className="text-ios-red">*</span>
                    </label>
                    <Select
                      value={tripForm.days}
                      onValueChange={(value) => setTripForm(prev => ({ ...prev, days: value }))}
                    >
                      <SelectTrigger
                        className="bg-ios-darker border-border text-white"
                        data-testid="select-edit-duration"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-ios-darker border-border">
                        {[1, 2, 3, 4, 5, 7, 10, 14, 21, 30].map(days => (
                          <SelectItem key={days} value={days.toString()} className="text-white hover:bg-card">
                            {days} {days === 1 ? 'day' : 'days'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-white mb-2">Status</label>
                    <Select
                      value={tripForm.status}
                      onValueChange={(value: 'planning' | 'active' | 'completed') => setTripForm(prev => ({ ...prev, status: value }))}
                    >
                      <SelectTrigger
                        className="bg-ios-darker border-border text-white"
                        data-testid="select-edit-status"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-ios-darker border-border">
                        <SelectItem value="planning" className="text-white hover:bg-card">Planning</SelectItem>
                        <SelectItem value="active" className="text-white hover:bg-card">Active</SelectItem>
                        <SelectItem value="completed" className="text-white hover:bg-card">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-white mb-2">Notes</label>
                  <Textarea
                    value={tripForm.notes}
                    onChange={(e) => setTripForm(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Add any notes about your trip..."
                    className="bg-ios-darker border-border text-white placeholder-ios-gray min-h-[100px]"
                    data-testid="textarea-edit-notes"
                  />
                </div>

                <div className="flex space-x-4">
                  <Button
                    type="button"
                    onClick={handleCancel}
                    variant="outline"
                    className="flex-1 bg-ios-darker border-border text-white hover:bg-card smooth-transition interactive-tap radius-md"
                    data-testid="button-cancel-edit"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSave}
                    disabled={updateTripMutation.isPending}
                    className="flex-1 bg-ios-blue hover:bg-ios-blue smooth-transition interactive-tap radius-md"
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

        {/* Trip Content */}
        <div className="space-y-6">
          {/* Trip Details */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-xl font-bold text-white">Trip Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-secondary radius-md">
                  <i className="fas fa-calendar text-ios-blue text-xl mb-2"></i>
                  <p className="text-sm text-muted-foreground">Duration</p>
                  <p className="font-bold text-foreground">{trip.days} days</p>
                </div>
                <div className="text-center p-4 bg-secondary radius-md">
                  <i className="fas fa-rupee-sign text-ios-green text-xl mb-2"></i>
                  <p className="text-sm text-muted-foreground">Budget</p>
                  <p className="font-bold text-foreground">
                    {(() => {
                      const symbols: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AUD: 'A$', CAD: 'C$', JPY: '¥', CNY: '¥' };
                      const symbol = symbols[trip.currency || 'INR'] || trip.currency || '₹';
                      return `${symbol}${trip.budget}`;
                    })()}
                  </p>
                </div>
                <div className="text-center p-4 bg-secondary radius-md">
                  <i className="fas fa-users text-ios-orange text-xl mb-2"></i>
                  <p className="text-sm text-muted-foreground">Group</p>
                  <p className="font-bold text-foreground capitalize">{String(trip.groupSize).replace('-', ' ')}</p>
                </div>
                <div className="text-center p-4 bg-secondary radius-md">
                  {selectedStyle && <selectedStyle.icon className={`${selectedStyle.color} w-6 h-6 mb-2 mx-auto`} />}
                  <p className="text-sm text-muted-foreground">Style</p>
                  <p className="font-bold text-foreground capitalize">{trip.travelStyle.replace('-', ' ')}</p>
                </div>
                <div className="text-center p-4 bg-secondary radius-md">
                  {weather ? (
                    <>
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <i className={`${weather.current.icon} text-ios-blue text-2xl`}></i>
                      </div>
                      <p className="text-sm text-muted-foreground">{weather.current.condition}</p>
                      <p className="font-bold text-foreground">{Math.round(weather.current.temperature)}°C</p>
                    </>
                  ) : weatherLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-ios-blue mx-auto mb-2"></div>
                      <p className="text-sm text-muted-foreground">Weather</p>
                      <p className="font-bold text-foreground text-xs">Loading...</p>
                    </>
                  ) : (
                    <>
                      <i className="fas fa-exclamation-circle text-ios-gray text-xl mb-2"></i>
                      <p className="text-sm text-muted-foreground">Weather</p>
                      <p className="font-bold text-ios-gray text-xs">Unavailable</p>
                    </>
                  )}
                </div>
                {trip.transportMode && (
                  <div className="text-center p-4 bg-secondary radius-md">
                    <i className={`${trip.transportMode === 'flight' ? 'fas fa-plane' : trip.transportMode === 'train' ? 'fas fa-train' : trip.transportMode === 'bus' ? 'fas fa-bus' : trip.transportMode === 'car' ? 'fas fa-car-side' : 'fas fa-ship'} text-ios-blue text-xl mb-2`}></i>
                    <p className="text-sm text-muted-foreground">Transport</p>
                    <p className="font-bold text-foreground capitalize">{trip.transportMode}</p>
                  </div>
                )}
              </div>

              {tripForm.notes && (
                <div className="mt-6">
                  <h4 className="font-semibold text-white mb-2">Notes</h4>
                  <p className="text-ios-gray bg-ios-darker radius-md p-4">{tripForm.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Trip Map */}
          <TripMap destination={trip.destination} itinerary={Array.isArray(trip.itinerary) ? trip.itinerary : []} />

          {/* Cost Breakdown & Budget Tracker */}
          <BudgetTracker trip={trip} />

          {/* Itinerary Manager */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-bold text-white">Your Itinerary</h3>
            </div>
            <ItineraryManager trip={trip} />
          </div>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-xl font-bold text-white">AI Trip Planner</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-white mb-2">Location</label>
                  <Input type="text" value={tripForm.destination} disabled className="bg-ios-darker border-border text-white" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-white mb-2">Budget (INR)</label>
                  <Input type="number" value={aiBudget} onChange={(e) => setAiBudget(e.target.value)} className="bg-ios-darker border-border text-white" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-white mb-2">Number of People</label>
                  <Input type="number" value={aiGroupSize} onChange={(e) => setAiGroupSize(e.target.value)} className="bg-ios-darker border-border text-white" />
                </div>
              </div>
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-white text-base">Weather Forecast</CardTitle>
                </CardHeader>
                <CardContent>
                  {weather ? (
                    <div className="space-y-3">
                      <div className="text-sm text-white">
                        <span className="font-semibold">Current:</span> {Number(weather?.current?.temperature)}°C • {String(weather?.current?.condition || '')}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {(Array.isArray(weather?.forecast) ? weather.forecast.slice(0, 6) : []).map((d: any, idx: number) => (
                          <div key={`wf-${idx}`} className="text-xs text-white bg-ios-darker radius-md p-2">
                            <div className="font-semibold">{String(d.day)}</div>
                            <div className="text-ios-gray">{Number(d.low)}° / {Number(d.high)}° • {String(d.condition)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-ios-gray">Fetching weather forecast...</div>
                  )}
                </CardContent>
              </Card>
              <div>
                <label className="block text-sm font-semibold text-white mb-2">Additional Notes</label>
                <Textarea value={aiNotes} onChange={(e) => setAiNotes(e.target.value)} placeholder="Preferences, constraints, must-see places…" className="bg-ios-darker border-border text-white placeholder-ios-gray min-h-[100px]" />
              </div>
              <div className="flex justify-end">
                <Button onClick={() => generatePlanMutation.mutate()} disabled={generatePlanMutation.isPending} className="bg-ios-blue hover:bg-ios-blue smooth-transition interactive-tap radius-md">
                  {generatePlanMutation.isPending ? (
                    <>
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                      {planStage === 'fetching' ? 'Fetching locations…' : planStage === 'generating' ? 'Generating Plan…' : 'Processing…'}
                    </>
                  ) : (
                    <>
                      <i className="fas fa-robot mr-2"></i>
                      Generate AI Plan
                    </>
                  )}
                </Button>
              </div>

              {trip.aiPlanMarkdown && (
                <div className="mt-6 prose prose-invert max-w-none">
                  <ReactMarkdown>{trip.aiPlanMarkdown}</ReactMarkdown>
                </div>
              )}

              {openApiPlanning.length > 0 && (
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="bg-card border-border">
                    <CardHeader>
                      <CardTitle className="text-white text-base">Geocoded Places</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {openApiPlanning.slice(0, 8).map((p) => (
                          <div key={`geo-${p.id}`} className="text-sm text-white bg-ios-darker radius-md p-3">
                            <div className="font-semibold">{p.title}</div>
                            <div className="text-ios-gray">{p.address}</div>
                            <div className="text-xs text-ios-gray">{p.coords.lat}, {p.coords.lon}</div>
                            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(p.displayName || p.title || ''))}`} target="_blank" rel="noreferrer" className="text-xs text-ios-blue underline">Open Map</a>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {segments.length > 0 && (
                    <Card className="bg-card border-border">
                      <CardHeader>
                        <CardTitle className="text-white text-base">Travel Distances & Durations</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {segments.map((s, i) => (
                            <div key={`seg-${i}`} className="text-sm text-white bg-ios-darker radius-md p-3">
                              <div className="font-semibold">{s.from.title} → {s.to.title}</div>
                              <div className="text-ios-gray">{s.km} km • ~{s.mins} min ({s.mode})</div>
                              <a href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(`${s.from.coords.lat},${s.from.coords.lon}`)}&destination=${encodeURIComponent(`${s.to.coords.lat},${s.to.coords.lon}`)}&travelmode=${s.mode === 'walk' ? 'walking' : 'transit'}`} target="_blank" rel="noreferrer" className="text-xs text-ios-blue underline">Directions</a>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}



              {(Array.isArray(hotelResults) || Array.isArray(foodResults) || Array.isArray(sightsResults)) && (
                <Card className="bg-card border-border mt-6">
                  <CardHeader>
                    <CardTitle className="text-white text-base">Suggestions: Hotels, Restaurants, Tourist Spots</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <div className="text-white font-semibold mb-2">Hotels</div>
                        <div className="space-y-2">
                          {(hotelResults || []).slice(0, 5).map((i: any) => (
                            <div key={`h-${i.id}`} className="text-sm text-white bg-ios-darker radius-md p-3">
                              <div className="font-semibold">{String(i.name_en || i.name_local)}</div>
                              <div className="text-ios-gray">{String(i.display_name || '')}</div>
                              <div className="text-xs text-ios-gray">{Number(i.lat)}, {Number(i.lon)}</div>
                              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(i.display_name || i.name_en || i.name_local || ''))}`} target="_blank" rel="noreferrer" className="text-xs text-ios-blue underline">Open Map</a>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-white font-semibold mb-2">Restaurants</div>
                        <div className="space-y-2">
                          {(foodResults || []).slice(0, 5).map((i: any) => (
                            <div key={`f-${i.id}`} className="text-sm text-white bg-ios-darker radius-md p-3">
                              <div className="font-semibold">{String(i.name_en || i.name_local)}</div>
                              <div className="text-ios-gray">{String(i.display_name || '')}</div>
                              <div className="text-xs text-ios-gray">{Number(i.lat)}, {Number(i.lon)}</div>
                              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(i.display_name || i.name_en || i.name_local || ''))}`} target="_blank" rel="noreferrer" className="text-xs text-ios-blue underline">Open Map</a>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-white font-semibold mb-2">Tourist Spots</div>
                        <div className="space-y-2">
                          {(sightsResults || []).slice(0, 5).map((i: any) => (
                            <div key={`s-${i.id}`} className="text-sm text-white bg-ios-darker radius-md p-3">
                              <div className="font-semibold">{String(i.name_en || i.name_local)}</div>
                              <div className="text-ios-gray">{String(i.display_name || '')}</div>
                              <div className="text-xs text-ios-gray">{Number(i.lat)}, {Number(i.lon)}</div>
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(i.display_name || i.name_en || i.name_local || ''))}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-ios-blue underline"
                                onClick={() => {
                                  try { logInfo('place_open_map', { id: String(i.id), type: 'tourist_spot', lat: Number(i.lat), lon: Number(i.lon), name: String(i.name_en || i.name_local || i.display_name || '') }); } catch { }
                                }}
                              >
                                Open Map
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

            </CardContent>
          </Card>

          {/* Journal Entries for this Trip */}
          {tripJournalEntries.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold text-white">Trip Journal</CardTitle>
                  <Link href="/app/journal">
                    <Button variant="outline" size="sm" className="bg-ios-darker border-border text-white hover:bg-card smooth-transition interactive-tap radius-md">
                      View All
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {tripJournalEntries.slice(0, 3).map((entry) => (
                    <div key={entry.id} className="bg-ios-darker radius-md p-4">
                      <h4 className="font-bold text-white mb-2">{entry.title}</h4>
                      <p className="text-sm text-ios-gray mb-2 line-clamp-2">{entry.content}</p>
                      <div className="flex items-center justify-between text-xs text-ios-gray">
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
      </div>
    </div >
  );
}
