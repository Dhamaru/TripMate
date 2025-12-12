import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { safeParsePlan } from "@/lib/planParser";
import { TripMateLogo } from "@/components/TripMateLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import type { User } from "@shared/schema";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

import { Mountain, Armchair, Landmark, Utensils } from "lucide-react";

const travelStyles = [
  { id: 'adventure', icon: Mountain, name: 'Adventure', color: 'text-ios-blue' },
  { id: 'relaxed', icon: Armchair, name: 'Relaxed', color: 'text-ios-orange' },
  { id: 'cultural', icon: Landmark, name: 'Cultural', color: 'text-ios-blue' },
  { id: 'culinary', icon: Utensils, name: 'Culinary', color: 'text-ios-green' }
];

export default function TripPlanner() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth() as { user: User | undefined; isLoading: boolean; isAuthenticated: boolean };
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [tripForm, setTripForm] = useState({
    destination: '',
    budget: '',
    currency: 'INR',
    days: '',
    groupSize: '',
    travelStyle: '',
    transportMode: '',
    isInternational: false,
    notes: ''
  });

  const [selectedStyle, setSelectedStyle] = useState('');
  const [selectedPackingItems, setSelectedPackingItems] = useState<string[]>([]);


  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/signin";
      }, 500);
      return;
    }
  }, [isAuthenticated, authLoading, toast]);

  const createTripMutation = useMutation({
    mutationFn: async (tripData: any) => {
      const response = await apiRequest('POST', '/api/v1/trips', tripData);
      return response.json();
    },
    onSuccess: async (trip: any) => {
      console.log("[Render Check] TripPlanner loaded with latest fixes.");
      queryClient.invalidateQueries({ queryKey: ['/api/v1/trips'] });

      console.log("Trip created response:", trip); // Debug log

      // Create packing list with selected items if any are selected
      if (selectedPackingItems.length > 0 && planTripMutation.data?.packingList) {
        try {
          const packingListItems = selectedPackingItems.map((itemName, index) => ({
            name: itemName,
            quantity: 1,
            packed: false,
            category: 'general'
          }));

          await apiRequest('POST', '/api/v1/packing-lists', {
            name: `${trip.destination} - Packing List`,
            tripId: trip.id || trip._id,
            items: packingListItems
          });

          queryClient.invalidateQueries({ queryKey: ['/api/v1/packing-lists'] });
        } catch (error) {
          console.error('Failed to create packing list:', error);
          // Don't fail the whole trip creation if packing list fails
        }
      }

      toast({
        title: "Trip Created!",
        description: "Your trip has been successfully planned.",
      });

      const targetId = trip.id || trip._id;
      if (targetId) {
        setLocation(`/app/trips/${targetId}`);
      } else {
        console.error("Trip ID missing in response:", trip);
        const keys = Object.keys(trip || {}).join(', ');
        const preview = JSON.stringify(trip).slice(0, 100);
        toast({
          title: "Error: Trip ID Missing",
          description: `Created but ID missing. Keys: [${keys}]. Preview: ${preview}`,
          variant: "destructive"
        });
        // Do not redirect so we can see the error
      }
    },
    onError: (error: any) => {
      console.error('Trip creation error:', error);
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/signin";
        }, 500);
        return;
      }
      const errorMessage = error?.message || "Failed to create trip. Please try again.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const planTripMutation = useMutation({
    mutationFn: async () => {
      const dest = tripForm.destination.trim();
      const days = parseInt(tripForm.days) || 1;
      const persons = parseInt(tripForm.groupSize) || 1;
      const budget = tripForm.budget ? parseFloat(tripForm.budget) : undefined;
      const currency = tripForm.currency || 'INR';
      const typeOfTrip = selectedStyle || 'relaxed';
      const travelMedium = tripForm.transportMode || 'road';
      const preferences = tripForm.notes || '';
      const payload = { destination: dest, days, persons, budget, currency, typeOfTrip, travelMedium, preferences } as any;

      const trySafeParse = (obj: any) => safeParsePlan(obj);

      try {
        const res = await apiRequest('POST', '/api/v1/trips/generate-itinerary', payload);
        if (res.ok) {
          const json = await res.json().catch(() => null);
          const parsed = trySafeParse(json);
          if (parsed) return parsed;
          const rawText = await res.text();
          const parsed2 = trySafeParse(rawText);
          if (parsed2) return parsed2;
          throw new Error('parse_failed');
        }
      } catch { }

      try {
        const res2 = await apiRequest('POST', '/api/tools/planTrip', payload);
        let data2: any = null;
        try { data2 = await res2.json(); } catch { }
        const parsed3 = trySafeParse(data2);
        if (parsed3) return parsed3;
        const rawText2 = await res2.text();
        const parsed4 = trySafeParse(rawText2);
        if (parsed4) return parsed4;
      } catch (e: any) {
        console.error('planTrip API error:', e?.message || e);
      }
      const speedKmH = travelMedium === 'walk' ? 4 : travelMedium === 'transit' ? 20 : 30;
      const pace = typeOfTrip === 'relaxed' ? 'relaxed' : typeOfTrip === 'adventure' ? 'fast' : 'normal';
      const startHour = pace === 'relaxed' ? 9 : pace === 'fast' ? 8 : 8.5;
      const lunchHour = 13;
      const dinnerHour = 19;
      const activityDuration = pace === 'relaxed' ? 75 : pace === 'fast' ? 60 : 90;
      const bufferMin = 15;
      const toKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
      };
      const travelTime = (km: number) => Math.max(10, Math.round((km / speedKmH) * 60));
      const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');
      const fmt = (h: number, m: number) => `${pad(h)}:${pad(m)}`;
      const addMinutes = (h: number, m: number, add: number) => {
        const t = h * 60 + m + add;
        const nh = Math.floor(t / 60);
        const nm = t % 60;
        return { h: nh, m: nm };
      };
      let center = { lat: 0, lon: 0, display: dest };
      try {
        const geoRes = await apiRequest('GET', `/api/v1/geocode?query=${encodeURIComponent(dest)}`);
        const gj = await geoRes.json().catch(() => ({}));
        if (Number.isFinite(gj.lat) && Number.isFinite(gj.lon)) center = { lat: Number(gj.lat), lon: Number(gj.lon), display: String(gj.displayName || dest) };
      } catch { }
      const fetchItems = async (q: string) => {
        try {
          const r = await apiRequest('GET', `/api/v1/places/search?query=${encodeURIComponent(q)}&pageSize=50`);
          const j = await r.json().catch(() => ({}));
          const arr = Array.isArray(j?.items) ? j.items : [];
          return arr.map((i: any) => ({ id: String(i.id), name: String(i.name_en || i.name_local || i.display_name || ''), address: String([i.road, i.city, i.country, i.postcode].filter(Boolean).join(', ')), lat: Number(i.lat), lon: Number(i.lon), display: String(i.display_name || '') })).filter((x: any) => Number.isFinite(x.lat) && Number.isFinite(x.lon));
        } catch { return []; }
      };
      const attractions = await fetchItems(`${dest} tourist attractions`);
      const restaurants = await fetchItems(`${dest} restaurants`);
      const pickNearest = (from: { lat: number; lon: number }, pool: any[]) => {
        if (!pool.length) return null;
        let best = pool[0];
        let bd = toKm(from.lat, from.lon, best.lat, best.lon);
        for (let i = 1; i < pool.length; i++) {
          const d = toKm(from.lat, from.lon, pool[i].lat, pool[i].lon);
          if (d < bd) { bd = d; best = pool[i]; }
        }
        return best;
      };
      const daysOut: any[] = [];
      let remaining = attractions.slice(0);
      for (let d = 0; d < days; d++) {
        let cursor = { lat: center.lat, lon: center.lon };
        let h = Math.floor(startHour);
        let m = Math.round((startHour - Math.floor(startHour)) * 60);
        const acts: any[] = [];
        acts.push({ time: fmt(h, m), placeName: 'Wake up', address: center.display, type: 'park', entryFeeINR: 0, duration_minutes: 0, localFoodRecommendations: [], routeFromPrevious: { mode: travelMedium, distance_km: 0, travel_time_minutes: 0, from: 'Accommodation', to: 'Start' } });
        let count = 0;
        while (count < 3 && remaining.length) {
          const next = pickNearest(cursor, remaining);
          if (!next) break;
          const dist = toKm(cursor.lat, cursor.lon, next.lat, next.lon);
          const tt = travelTime(dist);
          const dep = addMinutes(h, m, tt);
          const at = dep;
          const end = addMinutes(at.h, at.m, activityDuration);
          acts.push({ time: fmt(at.h, at.m), placeName: next.name, address: next.address, type: 'sightseeing', entryFeeINR: 0, duration_minutes: activityDuration, localFoodRecommendations: [], routeFromPrevious: { mode: travelMedium, distance_km: Math.round(dist * 10) / 10, travel_time_minutes: tt, from: 'Previous', to: next.name } });
          const buf = addMinutes(end.h, end.m, bufferMin);
          h = buf.h; m = buf.m;
          cursor = { lat: next.lat, lon: next.lon };
          remaining = remaining.filter((x: any) => x.id !== next.id);
          count++;
          if (h >= lunchHour && h < lunchHour + 2) {
            const lunchPick = pickNearest(cursor, restaurants) || null;
            const ldist = lunchPick ? toKm(cursor.lat, cursor.lon, lunchPick.lat, lunchPick.lon) : 0;
            const ltt = travelTime(ldist);
            const ldep = addMinutes(h, m, Math.max(0, lunchHour * 60 - (h * 60 + m)) + ltt);
            const lstart = ldep;
            const lend = addMinutes(lstart.h, lstart.m, 60);
            acts.push({ time: fmt(lstart.h, lstart.m), placeName: lunchPick ? lunchPick.name : 'Lunch', address: lunchPick ? lunchPick.address : center.display, type: 'restaurant', entryFeeINR: 0, duration_minutes: 60, localFoodRecommendations: [], routeFromPrevious: { mode: travelMedium, distance_km: Math.round(ldist * 10) / 10, travel_time_minutes: ltt, from: 'Previous', to: lunchPick ? lunchPick.name : 'Lunch' } });
            const lbuf = addMinutes(lend.h, lend.m, bufferMin);
            h = lbuf.h; m = lbuf.m;
            if (lunchPick) cursor = { lat: lunchPick.lat, lon: lunchPick.lon };
          }
        }
        if (h < dinnerHour) {
          const dinnerPick = pickNearest(cursor, restaurants) || null;
          const ddist = dinnerPick ? toKm(cursor.lat, cursor.lon, dinnerPick.lat, dinnerPick.lon) : 0;
          const dtt = travelTime(ddist);
          const ddep = addMinutes(h, m, Math.max(0, dinnerHour * 60 - (h * 60 + m)) + dtt);
          const dstart = ddep;
          const dend = addMinutes(dstart.h, dstart.m, 75);
          acts.push({ time: fmt(dstart.h, dstart.m), placeName: dinnerPick ? dinnerPick.name : 'Dinner', address: dinnerPick ? dinnerPick.address : center.display, type: 'restaurant', entryFeeINR: 0, duration_minutes: 75, localFoodRecommendations: [], routeFromPrevious: { mode: travelMedium, distance_km: Math.round(ddist * 10) / 10, travel_time_minutes: dtt, from: 'Previous', to: dinnerPick ? dinnerPick.name : 'Dinner' } });
          const dbuf = addMinutes(dend.h, dend.m, bufferMin);
          h = dbuf.h; m = dbuf.m;
        }
        acts.push({ time: fmt(h, m), placeName: 'Return to accommodation', address: center.display, type: 'park', entryFeeINR: 0, duration_minutes: 0, localFoodRecommendations: [], routeFromPrevious: { mode: travelMedium, distance_km: 0, travel_time_minutes: 0, from: 'Dinner', to: 'Accommodation' } });
        daysOut.push({ day: d + 1, activities: acts });
      }
      const perDayFood = pace === 'relaxed' ? 1200 : pace === 'fast' ? 900 : 1000;
      const perDayTransport = travelMedium === 'walk' ? 200 : travelMedium === 'transit' ? 400 : 600;
      const perDayActivities = 800;
      const perDayAccommodation = 1500;
      const totalINR = days * (perDayFood + perDayTransport + perDayActivities + perDayAccommodation) * persons;
      const costBreakdown = {
        accommodationINR: perDayAccommodation * days * persons,
        foodINR: perDayFood * days * persons,
        transportINR: perDayTransport * days * persons,
        activitiesINR: perDayActivities * days * persons,
        miscINR: Math.round(totalINR * 0.05),
        totalINR,
      };
      // Generate contextual packing list based on trip details
      const basePackingList = ['Phone Charger', 'Toothbrush', 'First Aid Kit', 'Travel Documents'];
      let packingList = [...basePackingList];

      // Add international items
      if (tripForm.isInternational) {
        packingList.push('Passport', 'Visa Documents', 'Travel Adapter');
      }

      // Add weather-based items
      try {
        const weatherRes = await apiRequest('GET', `/api/v1/weather?city=${encodeURIComponent(dest)}`);
        const weatherData = await weatherRes.json();
        const temp = Number(weatherData?.current?.temperature ?? 22);
        const cond = String(weatherData?.current?.condition || '').toLowerCase();
        const hum = Number(weatherData?.current?.humidity ?? 60);

        if (cond.includes('rain')) {
          packingList.push('Umbrella', 'Raincoat', 'Waterproof Shoes', 'Extra Socks');
        }
        if (cond.includes('snow') || temp <= 15) {
          packingList.push('Warm Jacket', 'Thermal Wear', 'Gloves', 'Scarf', 'Beanie');
        }
        if (cond.includes('sun') || temp >= 28) {
          packingList.push('Sunscreen', 'Sunglasses', 'Hat', 'Light Clothing', 'Water Bottle');
        }
        if (hum >= 70) {
          packingList.push('Mosquito Repellent', 'Anti-chafing Powder');
        }
      } catch { }

      // Add transport-specific items
      if (travelMedium === 'flight') {
        packingList.push('Neck Pillow', 'Eye Mask', 'Earplugs', 'Power Bank');
      } else if (travelMedium === 'train') {
        packingList.push('Travel Pillow', 'Snacks', 'Water Bottle');
      } else if (travelMedium === 'bus') {
        packingList.push('Travel Blanket', 'Snacks');
      } else if (travelMedium === 'car') {
        packingList.push('Roadside Kit', 'Car Documents');
      }

      // Add trip-type specific items
      if (typeOfTrip === 'adventure') {
        packingList.push('Comfortable Shoes', 'Backpack', 'Energy Bars');
      } else if (typeOfTrip === 'relaxed') {
        packingList.push('Comfortable Clothes', 'Book or E-reader');
      } else if (typeOfTrip === 'culinary') {
        packingList.push('Digestive Medicine', 'Wet Wipes');
      }

      // Remove duplicates and limit to reasonable number
      packingList = [...new Set(packingList)].slice(0, 15);

      // Initialize selected items with all items when plan is generated
      setSelectedPackingItems(packingList);
      return { destination: dest, days, persons, totalEstimatedCost: totalINR, currency: 'INR', costBreakdown, itinerary: daysOut, packingList, safetyTips: ['Keep copies of documents', 'Use registered taxis', 'Stay aware in crowded areas'] } as any;
    },
    onSuccess: (planData) => {
      // Automatically create the trip with the generated itinerary
      const styleMap: Record<string, string> = { adventure: 'adventure', relaxed: 'relaxed', cultural: 'cultural', culinary: 'culinary' };
      const tripData = {
        destination: tripForm.destination,
        budget: tripForm.budget ? parseFloat(tripForm.budget) : 0,
        days: parseInt(tripForm.days) || 1,
        groupSize: parseInt(tripForm.groupSize) || 1,
        travelStyle: styleMap[selectedStyle] || 'standard',
        transportMode: tripForm.transportMode || undefined,
        isInternational: !!tripForm.isInternational,
        status: 'planning' as const,
        notes: tripForm.notes,
        itinerary: Array.isArray(planData.itinerary) ? planData.itinerary.map((day: any, idx: number) => ({
          ...day,
          dayIndex: typeof day.dayIndex === 'number' ? day.dayIndex : idx,
          day: day.day || (idx + 1),
          activities: Array.isArray(day.activities) ? day.activities.map((act: any) => ({
            ...act,
            title: act.placeName || act.title || 'Activity',
          })) : []
        })) : [],
        costBreakdown: planData.costBreakdown,
      };

      createTripMutation.mutate(tripData);
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: 'Unauthorized', description: 'You are logged out. Logging in again...', variant: 'destructive' });
        setTimeout(() => { window.location.href = '/signin'; }, 500);
        return;
      }
      const msg = String((error as any)?.message || '');
      if (/^400:/.test(msg)) {
        const desc = msg.split(':').slice(1).join(':').trim() || 'Invalid input. Please review the form and try again.';
        toast({ title: 'Invalid Input', description: desc, variant: 'destructive' });
        return;
      }
      if (/^429:/.test(msg)) {
        const desc = msg.split(':').slice(1).join(':').trim() || 'Too many requests. Please wait a moment and try again.';
        toast({ title: 'Rate Limited', description: desc, variant: 'destructive' });
        return;
      }
      toast({ title: 'Error', description: 'Failed to generate itinerary.', variant: 'destructive' });
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tripForm.destination || !tripForm.days || !tripForm.groupSize || !selectedStyle) {
      toast({ title: "Missing Information", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }

    // Trigger plan generation first
    planTripMutation.mutate();
  };

  const handleStyleSelect = (styleId: string) => {
    setSelectedStyle(styleId);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-ios-darker flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ios-blue mx-auto mb-4"></div>
          <p className="text-ios-gray">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ios-darker text-white">
      {/* Navigation Header */}


      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-4" data-testid="planner-title">
            Plan Your Perfect Trip
          </h1>
          <p className="text-xl text-ios-gray max-w-2xl mx-auto" data-testid="planner-description">
            Tell us your preferences and let AI create a personalized itinerary just for you.
          </p>
        </div>

        <Card className="bg-ios-card border-ios-gray elev-1">
          <CardHeader>
            <CardTitle className="text-xl font-bold text-white">Trip Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6" data-testid="trip-planning-form">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-white mb-2">
                    Destination <span className="text-ios-red">*</span>
                  </label>
                  <Input
                    type="text"
                    placeholder="Where do you want to go?"
                    value={tripForm.destination}
                    onChange={(e) => setTripForm(prev => ({ ...prev, destination: e.target.value }))}
                    className="bg-ios-darker border-ios-gray text-white placeholder-ios-gray"
                    required
                    data-testid="input-destination"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-white mb-2">Budget</label>
                  <div className="flex gap-2">
                    <Select
                      value={tripForm.currency}
                      onValueChange={(value) => setTripForm(prev => ({ ...prev, currency: value }))}
                    >
                      <SelectTrigger className="w-[100px] bg-ios-darker border-ios-gray text-white">
                        <SelectValue placeholder="INR" />
                      </SelectTrigger>
                      <SelectContent className="bg-ios-darker border-ios-gray">
                        <SelectItem value="INR" className="text-white hover:bg-ios-card">₹ INR</SelectItem>
                        <SelectItem value="USD" className="text-white hover:bg-ios-card">$ USD</SelectItem>
                        <SelectItem value="GBP" className="text-white hover:bg-ios-card">£ GBP</SelectItem>
                        <SelectItem value="EUR" className="text-white hover:bg-ios-card">€ EUR</SelectItem>
                        <SelectItem value="AUD" className="text-white hover:bg-ios-card">A$ AUD</SelectItem>
                        <SelectItem value="CAD" className="text-white hover:bg-ios-card">C$ CAD</SelectItem>
                        <SelectItem value="JPY" className="text-white hover:bg-ios-card">¥ JPY</SelectItem>
                        <SelectItem value="CNY" className="text-white hover:bg-ios-card">¥ CNY</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      placeholder="75000"
                      value={tripForm.budget}
                      onChange={(e) => setTripForm(prev => ({ ...prev, budget: e.target.value }))}
                      className="flex-1 bg-ios-darker border-ios-gray text-white placeholder-ios-gray"
                      min="0"
                      data-testid="input-budget"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-white mb-2">
                    Trip Duration <span className="text-ios-red">*</span>
                  </label>
                  <Select
                    value={tripForm.days}
                    onValueChange={(value) => setTripForm(prev => ({ ...prev, days: value }))}
                    required
                  >
                    <SelectTrigger
                      className="bg-ios-darker border-ios-gray text-white"
                      data-testid="select-duration"
                    >
                      <SelectValue placeholder="Select duration" />
                    </SelectTrigger>
                    <SelectContent className="bg-ios-darker border-ios-gray">
                      <SelectItem value="1" className="text-white hover:bg-ios-card">1 day</SelectItem>
                      <SelectItem value="2" className="text-white hover:bg-ios-card">2 days</SelectItem>
                      <SelectItem value="3" className="text-white hover:bg-ios-card">3 days</SelectItem>
                      <SelectItem value="4" className="text-white hover:bg-ios-card">4 days</SelectItem>
                      <SelectItem value="5" className="text-white hover:bg-ios-card">5 days</SelectItem>
                      <SelectItem value="7" className="text-white hover:bg-ios-card">1 week</SelectItem>
                      <SelectItem value="10" className="text-white hover:bg-ios-card">10 days</SelectItem>
                      <SelectItem value="14" className="text-white hover:bg-ios-card">2 weeks</SelectItem>
                      <SelectItem value="21" className="text-white hover:bg-ios-card">3 weeks</SelectItem>
                      <SelectItem value="30" className="text-white hover:bg-ios-card">1 month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-white mb-2">
                    Group Size <span className="text-ios-red">*</span>
                  </label>
                  <Select
                    value={tripForm.groupSize}
                    onValueChange={(value) => setTripForm(prev => ({ ...prev, groupSize: value }))}
                    required
                  >
                    <SelectTrigger
                      className="bg-ios-darker border-ios-gray text-white"
                      data-testid="select-group-size"
                    >
                      <SelectValue placeholder="Select group size" />
                    </SelectTrigger>
                    <SelectContent className="bg-ios-darker border-ios-gray">
                      <SelectItem value="1" className="text-white hover:bg-ios-card">Solo traveler</SelectItem>
                      <SelectItem value="2" className="text-white hover:bg-ios-card">Couple (2 people)</SelectItem>
                      <SelectItem value="4" className="text-white hover:bg-ios-card">Small group (3-5 people)</SelectItem>
                      <SelectItem value="8" className="text-white hover:bg-ios-card">Large group (6+ people)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  Travel Style <span className="text-ios-red">*</span>
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {travelStyles.map((style) => (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => handleStyleSelect(style.id)}
                      className={`bg-ios-darker border-2 radius-md p-4 text-center smooth-transition flex flex-col items-center justify-center ${selectedStyle === style.id
                        ? 'border-ios-blue bg-ios-blue/20'
                        : 'border-ios-gray hover:border-ios-blue'
                        }`}
                      data-testid={`travel-style-${style.id}`}
                    >
                      <style.icon className={`${style.color} mb-2 w-6 h-6`} />
                      <div className="text-sm font-medium text-white">{style.name}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-white mb-2">Additional Notes</label>
                <Textarea
                  placeholder="Any specific preferences, requirements, or things you'd like to include in your trip?"
                  value={tripForm.notes}
                  onChange={(e) => setTripForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="bg-ios-darker border-ios-gray text-white placeholder-ios-gray min-h-[100px]"
                  data-testid="textarea-notes"
                />
              </div>

              <Button
                type="submit"
                disabled={createTripMutation.isPending || planTripMutation.isPending}
                className="w-full bg-gradient-to-r from-ios-blue to-purple-600 text-white py-4 radius-md text-lg font-semibold smooth-transition interactive-tap disabled:opacity-50"
                data-testid="button-create-trip"
              >
                {createTripMutation.isPending ? (
                  <>
                    <i className="fas fa-save fa-spin mr-2"></i>
                    Finalizing Your Trip...
                  </>
                ) : planTripMutation.isPending ? (
                  <>
                    <i className="fas fa-brain fa-spin mr-2"></i>
                    Designing Your Experience...
                  </>
                ) : (
                  <>
                    <i className="fas fa-magic mr-2"></i>
                    Generate My Itinerary
                  </>
                )}
              </Button>
              {(!tripForm.budget || !tripForm.groupSize) && (
                <div className="text-xs text-ios-orange mt-2 text-center">Please provide Budget and People for better results.</div>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Loading Skeleton */}
        {(createTripMutation.isPending || planTripMutation.isPending) && (
          <Card className="bg-ios-card border-ios-gray elev-1 mt-8">
            <CardHeader>
              <CardTitle className="text-xl font-bold text-white">
                {planTripMutation.isPending ? "Designing Your Perfect Itinerary..." : "Finalizing details..."}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-ios-darker border border-ios-gray rounded-lg p-4 space-y-3">
                    <div className="h-6 w-24 bg-gray-800/50 rounded animate-pulse"></div>
                    <div className="space-y-2">
                      <div className="h-4 w-full bg-gray-800/50 rounded animate-pulse"></div>
                      <div className="h-4 w-5/6 bg-gray-800/50 rounded animate-pulse"></div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {planTripMutation.data && !planTripMutation.data.error && (
          <div aria-live="polite" aria-atomic="true">
            <Card className="bg-ios-card border-ios-gray elev-1 mt-8" role="region" aria-label="Trip Plan">
              <CardHeader>
                <CardTitle className="text-xl font-bold text-white" tabIndex={-1} id="trip-plan-heading">
                  Trip Plan — {String(planTripMutation.data.destination || 'Unknown Destination')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm text-ios-gray">
                    <div><div className="text-white">Days</div><div>{Number(planTripMutation.data.days) || ''}</div></div>
                    <div><div className="text-white">Persons</div><div>{Number(planTripMutation.data.persons) || ''}</div></div>
                    <div><div className="text-white">Budget</div><div>{tripForm.budget ? `₹${Number(tripForm.budget).toLocaleString('en-IN')}` : '—'}</div></div>
                    <div><div className="text-white">Estimated Total</div><div>₹{Number(planTripMutation.data.totalEstimatedCost || 0).toLocaleString('en-IN')}</div></div>
                    <div><div className="text-white">Currency</div><div>{String(planTripMutation.data.currency || 'INR')}</div></div>
                  </div>

                  {planTripMutation.data.costBreakdown && (
                    <div>
                      <div className="font-bold text-white mb-2">Cost Breakdown</div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm text-ios-gray">
                        {['accommodationINR', 'foodINR', 'transportINR', 'activitiesINR', 'miscINR', 'totalINR'].map((k) => (
                          <div key={k}><span className="text-white capitalize">{k.replace('INR', '').replace(/([A-Z])/g, ' $1')}</span><div>₹{Number(planTripMutation.data.costBreakdown[k]).toLocaleString('en-IN')}</div></div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    {Array.isArray(planTripMutation.data.itinerary) && planTripMutation.data.itinerary.map((d: any) => (
                      <Card key={`day-${d.day}`} className="bg-ios-darker border-ios-gray">
                        <CardHeader>
                          <CardTitle className="text-white">Day {Number(d.day)}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {Array.isArray(d.activities) && d.activities.map((a: any, idx: number) => (
                            <div key={`act-${d.day}-${idx}`} className="space-y-1">
                              <div className="flex items-start justify-between">
                                <div>
                                  <div className="text-sm text-ios-gray">{String(a.time)} • {String(a.placeName || a.title || '')}</div>
                                  {a.address && (
                                    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.address)}`} target="_blank" rel="noreferrer" className="text-xs text-ios-blue underline">
                                      {String(a.address)}
                                    </a>
                                  )}
                                </div>
                                <div className="text-sm text-ios-green">
                                  {typeof a.entryFeeINR === 'number' ? `₹${Number(a.entryFeeINR).toLocaleString('en-IN')}` : ''}
                                </div>
                              </div>
                              {Array.isArray(a.localFoodRecommendations) && a.localFoodRecommendations.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {a.localFoodRecommendations.map((f: any, i: number) => (
                                    <span key={`food-${i}`} className="text-xs bg-ios-card text-white px-2 py-1 rounded-full">{String(f)}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {Array.isArray(planTripMutation.data.packingList) && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-bold text-white">Packing List - Select Items to Save</div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedPackingItems(planTripMutation.data.packingList)}
                            className="text-xs bg-ios-darker border-ios-gray text-white hover:bg-ios-card"
                            data-testid="button-select-all-packing"
                          >
                            Select All
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedPackingItems([])}
                            className="text-xs bg-ios-darker border-ios-gray text-white hover:bg-ios-card"
                            data-testid="button-deselect-all-packing"
                          >
                            Deselect All
                          </Button>
                        </div>
                      </div>
                      <ul className="text-sm text-ios-gray space-y-2">
                        {planTripMutation.data.packingList.map((p: any, i: number) => {
                          const itemName = String(p);
                          const isSelected = selectedPackingItems.includes(itemName);
                          return (
                            <li key={`pack-${i}`} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedPackingItems(prev => [...prev, itemName]);
                                  } else {
                                    setSelectedPackingItems(prev => prev.filter(item => item !== itemName));
                                  }
                                }}
                                aria-label={`Pack ${p}`}
                                className="cursor-pointer"
                                data-testid={`checkbox-pack-${i}`}
                              />
                              <span className={isSelected ? 'text-white' : 'text-ios-gray line-through'}>{itemName}</span>
                            </li>
                          );
                        })}
                      </ul>
                      <p className="text-xs text-ios-gray mt-2">
                        <i className="fas fa-info-circle mr-1"></i>
                        {selectedPackingItems.length} of {planTripMutation.data.packingList.length} items selected
                      </p>
                    </div>
                  )}

                  {Array.isArray(planTripMutation.data.safetyTips) && (
                    <div>
                      <div className="font-bold text-white mb-2">Safety Tips</div>
                      <ul className="list-disc ml-6 text-sm text-ios-gray">
                        {planTripMutation.data.safetyTips.map((s: any, i: number) => (
                          <li key={`safe-${i}`}>{String(s)}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <Button onClick={() => {
                      const styleMap: Record<string, string> = { adventure: 'adventure', relaxed: 'relaxed', cultural: 'cultural', culinary: 'culinary' };
                      createTripMutation.mutate({
                        destination: tripForm.destination,
                        budget: tripForm.budget ? Number(tripForm.budget) : 0,
                        days: Number(tripForm.days || 1),
                        groupSize: Number(tripForm.groupSize || 1),
                        travelStyle: styleMap[selectedStyle] || 'standard',
                        transportMode: tripForm.transportMode || undefined,
                        isInternational: !!tripForm.isInternational,
                        status: 'planning' as const,
                        notes: tripForm.notes
                      });
                    }} className="bg-ios-blue">Save Trip</Button>
                    <Button variant="outline" onClick={() => window.print()}>Export as PDF</Button>
                    <Button variant="outline" onClick={() => {
                      const shareData = { title: 'Trip Plan', text: `Plan for ${planTripMutation.data.destination}`, url: window.location.href };
                      if (navigator.share) navigator.share(shareData as any); else navigator.clipboard?.writeText(shareData.url);
                    }}>Share</Button>
                    <Button variant="secondary" onClick={() => { if (!planTripMutation.isPending) planTripMutation.mutate(); }} disabled={planTripMutation.isPending}>Regenerate Plan</Button>
                  </div>

                  <details className="mt-4">
                    <summary className="text-ios-gray">View Raw AI Output</summary>
                    <pre className="mt-2 text-xs text-ios-gray whitespace-pre-wrap bg-ios-darker p-3 rounded-xl">{JSON.stringify(planTripMutation.data, null, 2)}</pre>
                  </details>
                </div>
              </CardContent>
            </Card>
          </div>
        )
        }

        {
          planTripMutation.data && planTripMutation.data.error && (
            <Card className="bg-ios-card border-ios-gray elev-1 mt-8">
              <CardContent className="p-6">
                <div className="text-ios-red font-semibold mb-2">We couldn’t parse the plan — try regenerating.</div>
                <Button variant="secondary" onClick={() => planTripMutation.mutate()} disabled={planTripMutation.isPending}>
                  {planTripMutation.isPending ? 'Generating…' : 'Regenerate'}
                </Button>
                <details className="mt-4">
                  <summary className="text-ios-gray">View Raw AI Output</summary>
                  <pre className="mt-2 text-xs text-ios-gray whitespace-pre-wrap bg-ios-darker p-3 rounded-xl">{JSON.stringify(planTripMutation.data, null, 2)}</pre>
                </details>
              </CardContent>
            </Card>
          )
        }

        {/* AI Tips */}
        <Card className="bg-ios-card border-ios-gray elev-1 mt-8">
          <CardContent className="p-6">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-ios-orange rounded-xl flex items-center justify-center mr-3">
                <i className="fas fa-lightbulb text-white"></i>
              </div>
              <h3 className="text-lg font-bold text-white">AI Planning Tips</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-ios-gray">
              <div>
                <p className="mb-2">
                  <i className="fas fa-check text-ios-green mr-2"></i>
                  The more details you provide, the better your personalized itinerary will be.
                </p>
                <p className="mb-2">
                  <i className="fas fa-check text-ios-green mr-2"></i>
                  Budget helps us suggest appropriate accommodations and activities.
                </p>
              </div>
              <div>
                <p className="mb-2">
                  <i className="fas fa-check text-ios-green mr-2"></i>
                  Travel style influences the types of experiences we recommend.
                </p>
                <p className="mb-2">
                  <i className="fas fa-check text-ios-green mr-2"></i>
                  You can always edit and customize your itinerary after it's generated.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div >
    </div >
  );
}
