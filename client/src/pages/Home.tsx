import { useQuery } from "@tanstack/react-query";
import { TripMateLogo } from "@/components/TripMateLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import type { Trip, JournalEntry, User } from "@shared/schema";
import { Plane, Map, BookOpen, Compass, CloudSun, DollarSign } from "lucide-react";

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

  const quickTools = [
    {
      title: "Trip Planner",
      description: "AI-powered trip planning",
      icon: Plane,
      href: "/planner",
      color: "from-ios-blue to-blue-600",
      testId: "tool-planner"
    },
    {
      title: "Offline Maps",
      description: "Download maps for offline use",
      icon: Map,
      href: "/maps",
      color: "from-green-500 to-emerald-600",
      testId: "tool-maps"
    },
    {
      title: "Travel Journal",
      description: "Document your adventures",
      icon: BookOpen,
      href: "/journal",
      color: "from-ios-orange to-orange-600",
      testId: "tool-journal"
    },
  ];

  return (
    <div className="min-h-screen bg-ios-darker text-white">
      {/* Navigation Header */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-ios-darker/80 border-b border-ios-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <TripMateLogo size="md" />
            <div className="flex items-center space-x-4">
              <Link href="/planner" className="text-gray-300 hover:text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors" data-testid="link-planner">
                Trip Planner
              </Link>
              <Link href="/journal" className="text-gray-300 hover:text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors" data-testid="link-journal">
                Journal
              </Link>
              <Link href="/maps" className="text-gray-300 hover:text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors" data-testid="link-maps">
                Maps
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
        {/* Welcome Section */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-white mb-2" data-testid="welcome-title">
            Welcome back, {user?.firstName || 'Traveler'}!
          </h1>
          <p className="text-lg text-ios-gray">Ready for your next adventure?</p>
        </div>

        {/* Current/Next Trip Section */}
        <div className="mb-12">
          {tripsLoading ? (
            <Card className="bg-ios-card border-ios-gray">
              <CardContent className="p-8">
                <div className="animate-pulse">
                  <div className="h-6 bg-ios-darker rounded w-1/4 mb-4"></div>
                  <div className="h-40 bg-ios-darker rounded mb-4"></div>
                  <div className="space-y-2">
                    <div className="h-4 bg-ios-darker rounded w-full"></div>
                    <div className="h-4 bg-ios-darker rounded w-3/4"></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : currentTrip ? (
            <Card className="bg-ios-card border-ios-gray overflow-hidden" data-testid="current-trip-card">
              <div className="relative bg-gradient-to-br from-ios-blue to-purple-600 h-64 flex items-center justify-center">
                <div className="text-center text-white px-6">
                  <Compass className="w-16 h-16 mx-auto mb-4 opacity-90" />
                  <h2 className="text-3xl font-bold mb-2">{currentTrip.destination}</h2>
                  <p className="text-lg opacity-90 mb-1">
                    {currentTrip.days} days • {currentTrip.groupSize}
                  </p>
                  {currentTrip.budget && (
                    <p className="text-md opacity-80">Budget: ₹{currentTrip.budget}</p>
                  )}
                </div>
                <Link href={`/trips/${currentTrip.id}`} className="absolute top-4 right-4">
                  <Button size="sm" variant="ghost" className="text-white hover:bg-white/20" data-testid="button-edit-trip">
                    <i className="fas fa-edit mr-2"></i>Edit Trip
                  </Button>
                </Link>
              </div>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-ios-gray mb-1">Status</p>
                    <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-ios-blue/20 text-ios-blue">
                      {currentTrip.status === 'active' ? 'In Progress' : currentTrip.status === 'planning' ? 'Planning' : 'Completed'}
                    </span>
                  </div>
                  <Link href={`/trips/${currentTrip.id}`}>
                    <Button className="bg-ios-blue hover:bg-blue-600" data-testid="button-view-trip-details">
                      View Details
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-ios-card border-ios-gray" data-testid="no-trips-card">
              <CardContent className="p-12 text-center">
                <div className="mb-6">
                  <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-ios-blue/10 flex items-center justify-center">
                    <Plane className="w-10 h-10 text-ios-blue" />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">Start Your Journey</h2>
                  <p className="text-ios-gray mb-6 max-w-md mx-auto">
                    Plan your next adventure with AI-powered trip planning. Get personalized itineraries, budget recommendations, and travel tips.
                  </p>
                </div>
                <Link href="/planner">
                  <Button className="bg-ios-blue hover:bg-blue-600 text-lg px-8 py-6" data-testid="button-plan-trip">
                    <Plane className="mr-2 w-5 h-5" />
                    Plan Your First Trip
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Quick Access Tools */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-6">Quick Access</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {quickTools.map((tool) => (
              <Link key={tool.title} href={tool.href}>
                <Card 
                  className="bg-ios-card border-ios-gray hover:transform hover:scale-105 transition-all duration-300 cursor-pointer overflow-hidden group"
                  data-testid={tool.testId}
                >
                  <div className={`h-32 bg-gradient-to-br ${tool.color} flex items-center justify-center`}>
                    <tool.icon className="w-12 h-12 text-white" />
                  </div>
                  <CardContent className="p-6">
                    <h3 className="font-bold text-white mb-2 text-lg">{tool.title}</h3>
                    <p className="text-sm text-ios-gray">{tool.description}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Journal Entries */}
        {!journalLoading && recentEntries.length > 0 && (
          <div className="mb-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Recent Memories</h2>
              <Link href="/journal">
                <Button variant="outline" className="bg-ios-darker border-ios-gray text-white hover:bg-ios-card">
                  View All
                </Button>
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recentEntries.map((entry) => (
                <Card 
                  key={entry.id} 
                  className="bg-ios-card border-ios-gray hover:transform hover:scale-105 transition-all duration-300 overflow-hidden"
                  data-testid={`journal-entry-${entry.id}`}
                >
                  <div className="h-32 bg-gradient-to-br from-ios-orange to-orange-600 flex items-center justify-center">
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
          </div>
        )}
      </div>
    </div>
  );
}
