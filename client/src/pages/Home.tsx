import { useQuery } from "@tanstack/react-query";
import { TripMateLogo } from "@/components/TripMateLogo";
import { WeatherWidget } from "@/components/WeatherWidget";
import { CurrencyConverter } from "@/components/CurrencyConverter";
import { PackingList } from "@/components/PackingList";
import { EmergencyServices } from "@/components/EmergencyServices";
import { OfflineMaps } from "@/components/OfflineMaps";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import type { Trip, JournalEntry, User } from "@shared/schema";

export default function Home() {
  const { user } = useAuth() as { user: User | undefined };

  const { data: trips, isLoading: tripsLoading } = useQuery<Trip[]>({
    queryKey: ['/api/trips'],
  });

  const { data: journalEntries, isLoading: journalLoading } = useQuery<JournalEntry[]>({
    queryKey: ['/api/journal'],
  });

  const currentTrip = trips?.find(trip => trip.status === 'active') || trips?.[0];
  const recentEntries = journalEntries?.slice(0, 3) || [];

  return (
    <div className="min-h-screen bg-ios-darker text-white">
      {/* Navigation Header */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-ios-darker/80 border-b border-ios-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <TripMateLogo size="md" />
            <div className="flex items-center space-x-4">
              <Link href="/planner" className="text-gray-300 hover:text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors">
                Trip Planner
              </Link>
              <Link href="/journal" className="text-gray-300 hover:text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors">
                Journal
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
                <Button 
                  onClick={() => window.location.href = '/api/logout'}
                  variant="outline"
                  size="sm"
                  className="bg-ios-card border-ios-gray text-white hover:bg-ios-darker"
                  data-testid="button-logout"
                >
                  Logout
                </Button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="pt-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2" data-testid="welcome-title">
            Welcome back, {user?.firstName || 'Traveler'}!
          </h1>
          <p className="text-ios-gray">Ready for your next adventure?</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
          {/* Current Trip Card */}
          <div className="lg:col-span-2">
            {tripsLoading ? (
              <Card className="bg-ios-card border-ios-gray">
                <CardContent className="p-6">
                  <div className="animate-pulse">
                    <div className="h-4 bg-ios-darker rounded w-1/4 mb-4"></div>
                    <div className="h-32 bg-ios-darker rounded mb-4"></div>
                    <div className="space-y-2">
                      <div className="h-4 bg-ios-darker rounded w-full"></div>
                      <div className="h-4 bg-ios-darker rounded w-3/4"></div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : currentTrip ? (
              <Card className="bg-ios-card border-ios-gray" data-testid="current-trip-card">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold text-white">Current Trip</h3>
                    <Link href={`/trips/${currentTrip._id}`}>
                      <Button size="sm" variant="ghost" className="text-ios-blue hover:text-blue-400">
                        <i className="fas fa-edit"></i>
                      </Button>
                    </Link>
                  </div>

                  <div className="relative rounded-2xl overflow-hidden mb-4 bg-gradient-to-br from-ios-blue to-purple-600 h-48 flex items-center justify-center">
                    <div className="text-center text-white">
                      <h4 className="text-2xl font-bold mb-2">{currentTrip.destination}</h4>
                      <p className="opacity-90">
                        {currentTrip.days} days • ₹{currentTrip.budget} budget
                      </p>
                    </div>
                  </div>

                  <div className="text-center">
                    <Link href={`/trips/${currentTrip._id}`}>
                      <Button className="bg-ios-blue hover:bg-blue-600">
                        View Trip Details
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-ios-card border-ios-gray" data-testid="no-trips-card">
                <CardContent className="p-6 text-center">
                  <div className="text-ios-gray mb-4">
                    <i className="fas fa-suitcase text-5xl"></i>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">No trips planned yet</h3>
                  <p className="text-ios-gray mb-4">Start planning your next adventure</p>
                  <Link href="/planner">
                    <Button className="bg-ios-blue hover:bg-blue-600" data-testid="button-plan-trip">
                      Plan Your First Trip
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Quick Tools */}
          <div className="space-y-6">
            <WeatherWidget location={currentTrip?.destination || "Current Location"} />

            <CurrencyConverter />

            <Card className="bg-ios-card border-ios-gray" data-testid="emergency-quick-access">
              <CardHeader>
                <CardTitle className="text-lg font-bold text-ios-red">Emergency</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button className="w-full bg-ios-red hover:bg-red-600" data-testid="button-sos">
                  <i className="fas fa-phone mr-2"></i>SOS Call
                </Button>
                <Button 
                  variant="outline"
                  className="w-full bg-ios-darker border-ios-gray text-white hover:bg-ios-card"
                  data-testid="button-find-hospital"
                >
                  <i className="fas fa-hospital mr-2"></i>Find Hospital
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Feature Tools Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          <PackingList tripId={currentTrip?.id} />
          <EmergencyServices location={currentTrip?.destination} />
        </div>

        {/* Offline Maps */}
        <div className="mb-12">
          <OfflineMaps />
        </div>

        {/* Recent Journal Entries */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold text-white">Recent Journal Entries</h3>
            <Link href="/journal">
              <Button variant="outline" className="bg-ios-darker border-ios-gray text-white hover:bg-ios-card">
                View All
              </Button>
            </Link>
          </div>

          {journalLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="bg-ios-card border-ios-gray">
                  <CardContent className="p-0">
                    <div className="animate-pulse">
                      <div className="h-32 bg-ios-darker"></div>
                      <div className="p-4 space-y-2">
                        <div className="h-4 bg-ios-darker rounded w-3/4"></div>
                        <div className="h-3 bg-ios-darker rounded w-full"></div>
                        <div className="h-3 bg-ios-darker rounded w-1/2"></div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : recentEntries.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recentEntries.map((entry) => (
                <Card 
                  key={entry.id} 
                  className="bg-ios-card border-ios-gray hover:transform hover:scale-105 transition-all duration-300 overflow-hidden"
                  data-testid={`journal-entry-${entry.id}`}
                >
                  <div className="h-32 bg-gradient-to-br from-ios-blue to-purple-600 flex items-center justify-center">
                    <div className="text-white text-center">
                      <i className="fas fa-map-marker-alt text-2xl mb-2"></i>
                      <p className="text-sm">{entry.location || 'Travel Memory'}</p>
                    </div>
                  </div>
                  <CardContent className="p-4">
                    <h4 className="font-bold mb-2 text-white">{entry.title}</h4>
                    <p className="text-sm text-ios-gray mb-2 line-clamp-2">
                      {entry.content.substring(0, 100)}...
                    </p>
                    <p className="text-xs text-ios-gray">
                      {new Date(entry.createdAt!).toLocaleDateString()}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="bg-ios-card border-ios-gray" data-testid="no-journal-entries">
              <CardContent className="p-8 text-center">
                <div className="text-ios-gray mb-4">
                  <i className="fas fa-book text-5xl"></i>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">No journal entries yet</h3>
                <p className="text-ios-gray mb-4">Start documenting your travel experiences</p>
                <Link href="/journal">
                  <Button className="bg-ios-orange hover:bg-orange-600" data-testid="button-start-journal">
                    Start Writing
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}