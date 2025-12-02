import { TripMateLogo } from "@/components/TripMateLogo";
import { OfflineMaps } from "@/components/OfflineMaps";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { Link, useLocation } from "wouter";
import type { User } from "@shared/schema";

export default function Maps() {
  const { user } = useAuth() as { user: User | undefined };
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-ios-darker text-white">
      {/* Navigation Header */}


      {/* Main Content */}
      <div className="responsive-container py-4">
        <div className="mb-4">
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
