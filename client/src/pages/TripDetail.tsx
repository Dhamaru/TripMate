import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TripMateLogo } from "@/components/TripMateLogo";
import { WeatherWidget } from "@/components/WeatherWidget";
import { PackingList } from "@/components/PackingList";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Link, useParams, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import type { Trip, JournalEntry, User } from "@shared/schema";

const travelStyles = [
  { id: 'adventure', icon: 'fas fa-backpack', name: 'Adventure', color: 'text-ios-blue' },
  { id: 'relaxation', icon: 'fas fa-spa', name: 'Relaxation', color: 'text-ios-orange' },
  { id: 'cultural', icon: 'fas fa-landmark', name: 'Cultural', color: 'text-purple-400' },
  { id: 'culinary', icon: 'fas fa-utensils', name: 'Culinary', color: 'text-ios-green' }
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
  const { toast } = useToast();
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

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, authLoading, toast]);

  const { data: trip, isLoading: tripLoading, error } = useQuery<Trip>({
    queryKey: ['/api/trips', id],
    enabled: !!id,
  });

  const { data: journalEntries } = useQuery<JournalEntry[]>({
    queryKey: ['/api/journal'],
  });

  const updateTripMutation = useMutation({
    mutationFn: async (updates: Partial<Trip>) => {
      const response = await apiRequest('PUT', `/api/trips/${id}`, updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trips', id] });
      queryClient.invalidateQueries({ queryKey: ['/api/trips'] });
      toast({
        title: "Trip Updated",
        description: "Your trip has been updated successfully.",
      });
      setIsEditing(false);
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
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
      const response = await apiRequest('DELETE', `/api/trips/${id}`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trips'] });
      toast({
        title: "Trip Deleted",
        description: "Your trip has been deleted.",
      });
      setLocation('/');
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to delete trip.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (trip) {
      setTripForm({
        destination: trip.destination,
        budget: trip.budget?.toString() || '',
        days: trip.days.toString(),
        groupSize: trip.groupSize,
        travelStyle: trip.travelStyle,
        status: trip.status as 'planning' | 'active' | 'completed',
        notes: (trip.itinerary as any)?.notes || ''
      });
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
      budget: tripForm.budget || '0',
      days: parseInt(tripForm.days),
      groupSize: tripForm.groupSize,
      travelStyle: tripForm.travelStyle,
      status: tripForm.status,
      itinerary: {
        ...(trip?.itinerary as any || {}),
        notes: tripForm.notes
      }
    };

    updateTripMutation.mutate(updates);
  };

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this trip? This action cannot be undone.')) {
      deleteTripMutation.mutate();
    }
  };

  const handleCancel = () => {
    if (trip) {
      setTripForm({
        destination: trip.destination,
        budget: trip.budget?.toString() || '',
        days: trip.days.toString(),
        groupSize: trip.groupSize,
        travelStyle: trip.travelStyle,
        status: trip.status as 'planning' | 'active' | 'completed',
        notes: (trip.itinerary as any)?.notes || ''
      });
    }
    setIsEditing(false);
  };

  const tripJournalEntries = journalEntries?.filter(entry => entry.tripId === id) || [];
  const selectedStyle = travelStyles.find(style => style.id === tripForm.travelStyle);

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

  if (error) {
    return (
      <div className="min-h-screen bg-ios-darker flex items-center justify-center">
        <Card className="bg-ios-card border-ios-gray max-w-md">
          <CardContent className="p-8 text-center">
            <div className="text-ios-red mb-4">
              <i className="fas fa-exclamation-triangle text-5xl"></i>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Trip Not Found</h2>
            <p className="text-ios-gray mb-4">The trip you're looking for doesn't exist or you don't have access to it.</p>
            <Link href="/">
              <Button className="bg-ios-blue hover:bg-blue-600">
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
        <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-ios-darker/80 border-b border-ios-card">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link href="/">
                <TripMateLogo size="md" />
              </Link>
            </div>
          </div>
        </nav>
        <div className="pt-20 flex items-center justify-center min-h-screen">
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
    <div className="min-h-screen bg-ios-darker text-white">
      {/* Navigation Header */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-ios-darker/80 border-b border-ios-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/">
              <TripMateLogo size="md" />
            </Link>
            <div className="flex items-center space-x-4">
              <Link href="/" className="text-gray-300 hover:text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors">
                <i className="fas fa-arrow-left mr-2"></i>
                Back to Home
              </Link>
              <div className="flex items-center space-x-2">
                {user?.profileImageUrl && (
                  <img 
                    src={user.profileImageUrl} 
                    alt="Profile" 
                    className="w-8 h-8 rounded-full object-cover"
                  />
                )}
                <span className="text-sm text-white">
                  {user?.firstName || user?.email}
                </span>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="pt-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Trip Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2" data-testid="trip-title">
                {trip.destination}
              </h1>
              <div className="flex items-center space-x-4 text-ios-gray">
                <span>{trip.days} days</span>
                <span>•</span>
                <span>₹{trip.budget} budget</span>
                <span>•</span>
                <span className="capitalize">{trip.groupSize.replace('-', ' ')}</span>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Badge className={`${statusColors[trip.status as keyof typeof statusColors]} text-white`}>
                {trip.status.charAt(0).toUpperCase() + trip.status.slice(1)}
              </Badge>
              {!isEditing && (
                <div className="flex space-x-2">
                  <Button
                    onClick={() => setIsEditing(true)}
                    variant="outline"
                    className="bg-ios-darker border-ios-gray text-white hover:bg-ios-card"
                    data-testid="button-edit-trip"
                  >
                    <i className="fas fa-edit mr-2"></i>
                    Edit
                  </Button>
                  <Button
                    onClick={handleDelete}
                    variant="outline"
                    className="bg-ios-darker border-ios-red text-ios-red hover:bg-ios-red hover:text-white"
                    data-testid="button-delete-trip"
                  >
                    <i className="fas fa-trash mr-2"></i>
                    Delete
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Hero Image */}
          <div className="relative rounded-3xl overflow-hidden h-64 bg-gradient-to-br from-ios-blue to-purple-600 flex items-center justify-center">
            <div className="text-center text-white">
              {selectedStyle && (
                <i className={`${selectedStyle.icon} text-6xl mb-4 opacity-50`}></i>
              )}
              <h2 className="text-2xl font-bold">{trip.destination}</h2>
              <p className="text-lg opacity-90 capitalize">
                {trip.travelStyle.replace('-', ' ')} Adventure
              </p>
            </div>
          </div>
        </div>

        {/* Edit Form */}
        {isEditing && (
          <Card className="bg-ios-card border-ios-gray mb-8">
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
                      className="bg-ios-darker border-ios-gray text-white"
                      data-testid="input-edit-destination"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-white mb-2">Budget (INR)</label>
                    <Input
                      type="number"
                      value={tripForm.budget}
                      onChange={(e) => setTripForm(prev => ({ ...prev, budget: e.target.value }))}
                      className="bg-ios-darker border-ios-gray text-white"
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
                        className="bg-ios-darker border-ios-gray text-white"
                        data-testid="select-edit-duration"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-ios-darker border-ios-gray">
                        {[1, 2, 3, 4, 5, 7, 10, 14, 21, 30].map(days => (
                          <SelectItem key={days} value={days.toString()} className="text-white hover:bg-ios-card">
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
                        className="bg-ios-darker border-ios-gray text-white"
                        data-testid="select-edit-status"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-ios-darker border-ios-gray">
                        <SelectItem value="planning" className="text-white hover:bg-ios-card">Planning</SelectItem>
                        <SelectItem value="active" className="text-white hover:bg-ios-card">Active</SelectItem>
                        <SelectItem value="completed" className="text-white hover:bg-ios-card">Completed</SelectItem>
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
                    className="bg-ios-darker border-ios-gray text-white placeholder-ios-gray min-h-[100px]"
                    data-testid="textarea-edit-notes"
                  />
                </div>

                <div className="flex space-x-4">
                  <Button
                    type="button"
                    onClick={handleCancel}
                    variant="outline"
                    className="flex-1 bg-ios-darker border-ios-gray text-white hover:bg-ios-card"
                    data-testid="button-cancel-edit"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSave}
                    disabled={updateTripMutation.isPending}
                    className="flex-1 bg-ios-blue hover:bg-blue-600"
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

        {/* Trip Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Trip Details */}
            <Card className="bg-ios-card border-ios-gray">
              <CardHeader>
                <CardTitle className="text-xl font-bold text-white">Trip Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-ios-darker rounded-xl">
                    <i className="fas fa-calendar text-ios-blue text-xl mb-2"></i>
                    <p className="text-sm text-ios-gray">Duration</p>
                    <p className="font-bold text-white">{trip.days} days</p>
                  </div>
                  <div className="text-center p-4 bg-ios-darker rounded-xl">
                    <i className="fas fa-rupee-sign text-ios-green text-xl mb-2"></i>
                    <p className="text-sm text-ios-gray">Budget</p>
                    <p className="font-bold text-white">₹{trip.budget}</p>
                  </div>
                  <div className="text-center p-4 bg-ios-darker rounded-xl">
                    <i className="fas fa-users text-ios-orange text-xl mb-2"></i>
                    <p className="text-sm text-ios-gray">Group</p>
                    <p className="font-bold text-white capitalize">{trip.groupSize.replace('-', ' ')}</p>
                  </div>
                  <div className="text-center p-4 bg-ios-darker rounded-xl">
                    {selectedStyle && <i className={`${selectedStyle.icon} ${selectedStyle.color} text-xl mb-2`}></i>}
                    <p className="text-sm text-ios-gray">Style</p>
                    <p className="font-bold text-white capitalize">{trip.travelStyle.replace('-', ' ')}</p>
                  </div>
                </div>

                {tripForm.notes && (
                  <div className="mt-6">
                    <h4 className="font-semibold text-white mb-2">Notes</h4>
                    <p className="text-ios-gray bg-ios-darker rounded-xl p-4">{tripForm.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Journal Entries for this Trip */}
            {tripJournalEntries.length > 0 && (
              <Card className="bg-ios-card border-ios-gray">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl font-bold text-white">Trip Journal</CardTitle>
                    <Link href="/journal">
                      <Button variant="outline" size="sm" className="bg-ios-darker border-ios-gray text-white hover:bg-ios-card">
                        View All
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {tripJournalEntries.slice(0, 3).map((entry) => (
                      <div key={entry.id} className="bg-ios-darker rounded-xl p-4">
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

          {/* Sidebar */}
          <div className="space-y-6">
            <WeatherWidget location={trip.destination} />
            <PackingList tripId={trip.id} />
          </div>
        </div>
      </div>
    </div>
  );
}