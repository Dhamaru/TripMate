import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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

const travelStyles = [
  { id: 'adventure', icon: 'fas fa-backpack', name: 'Adventure', color: 'text-ios-blue' },
  { id: 'relaxation', icon: 'fas fa-spa', name: 'Relaxation', color: 'text-ios-orange' },
  { id: 'cultural', icon: 'fas fa-landmark', name: 'Cultural', color: 'text-purple-400' },
  { id: 'culinary', icon: 'fas fa-utensils', name: 'Culinary', color: 'text-ios-green' }
];

export default function TripPlanner() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth() as { user: User | undefined; isLoading: boolean; isAuthenticated: boolean };
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [tripForm, setTripForm] = useState({
    destination: '',
    budget: '',
    days: '',
    groupSize: '',
    travelStyle: '',
    notes: ''
  });

  const [selectedStyle, setSelectedStyle] = useState('');

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

  const createTripMutation = useMutation({
    mutationFn: async (tripData: any) => {
      const response = await apiRequest('POST', '/api/trips', tripData);
      return response.json();
    },
    onSuccess: (trip) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trips'] });
      toast({
        title: "Trip Created!",
        description: "Your trip has been successfully planned.",
      });
      setLocation(`/trips/${trip.id}`);
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
        description: "Failed to create trip. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!tripForm.destination || !tripForm.days || !tripForm.groupSize || !selectedStyle) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    const tripData = {
      destination: tripForm.destination,
      budget: tripForm.budget || '0',
      days: parseInt(tripForm.days) || 1,
      groupSize: tripForm.groupSize,
      travelStyle: selectedStyle,
      status: 'planning',
      itinerary: {
        notes: tripForm.notes,
        activities: [],
        accommodation: null,
        transportation: null
      }
    };

    createTripMutation.mutate(tripData);
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
      <div className="pt-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-4" data-testid="planner-title">
            Plan Your Perfect Trip
          </h1>
          <p className="text-xl text-ios-gray max-w-2xl mx-auto" data-testid="planner-description">
            Tell us your preferences and let AI create a personalized itinerary just for you.
          </p>
        </div>

        <Card className="bg-ios-card border-ios-gray">
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
                  <label className="block text-sm font-semibold text-white mb-2">Budget (USD)</label>
                  <Input
                    type="number"
                    placeholder="1000"
                    value={tripForm.budget}
                    onChange={(e) => setTripForm(prev => ({ ...prev, budget: e.target.value }))}
                    className="bg-ios-darker border-ios-gray text-white placeholder-ios-gray"
                    min="0"
                    data-testid="input-budget"
                  />
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
                      <SelectItem value="solo" className="text-white hover:bg-ios-card">Solo traveler</SelectItem>
                      <SelectItem value="couple" className="text-white hover:bg-ios-card">Couple (2 people)</SelectItem>
                      <SelectItem value="small-group" className="text-white hover:bg-ios-card">Small group (3-5 people)</SelectItem>
                      <SelectItem value="large-group" className="text-white hover:bg-ios-card">Large group (6+ people)</SelectItem>
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
                      className={`bg-ios-darker border-2 rounded-xl p-4 text-center transition-all ${
                        selectedStyle === style.id 
                          ? 'border-ios-blue bg-ios-blue/20' 
                          : 'border-ios-gray hover:border-ios-blue'
                      }`}
                      data-testid={`travel-style-${style.id}`}
                    >
                      <i className={`${style.icon} ${style.color} mb-2 text-xl`}></i>
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
                disabled={createTripMutation.isPending}
                className="w-full bg-gradient-to-r from-ios-blue to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white py-4 rounded-xl text-lg font-semibold transition-all transform hover:scale-105 disabled:transform-none disabled:opacity-50"
                data-testid="button-create-trip"
              >
                {createTripMutation.isPending ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    Creating Your Trip...
                  </>
                ) : (
                  <>
                    <i className="fas fa-magic mr-2"></i>
                    Generate My Itinerary
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* AI Tips */}
        <Card className="bg-ios-card border-ios-gray mt-8">
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
      </div>
    </div>
  );
}
