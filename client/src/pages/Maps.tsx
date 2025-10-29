import { TripMateLogo } from "@/components/TripMateLogo";
import { OfflineMaps } from "@/components/OfflineMaps";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import type { User } from "@shared/schema";

export default function Maps() {
  const { user } = useAuth() as { user: User | undefined };

  return (
    <div className="min-h-screen bg-ios-darker text-white">
      {/* Navigation Header */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-ios-darker/80 border-b border-ios-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <TripMateLogo size="md" />
            <div className="flex items-center space-x-4">
              <Link href="/" className="text-gray-300 hover:text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors">
                Home
              </Link>
              <Link href="/planner" className="text-gray-300 hover:text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors">
                Trip Planner
              </Link>
              <Link href="/journal" className="text-gray-300 hover:text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors">
                Journal
              </Link>
              <Link href="/maps" className="text-white bg-ios-blue/20 px-3 py-2 rounded-lg text-sm font-medium">
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
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2" data-testid="maps-title">
            Offline Maps
          </h1>
          <p className="text-ios-gray">
            Download maps for offline navigation and explore without internet connection
          </p>
        </div>

        {/* Offline Maps Component */}
        <OfflineMaps />
      </div>
    </div>
  );
}
