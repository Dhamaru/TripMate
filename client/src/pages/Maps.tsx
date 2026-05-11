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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#222222] tracking-tight" data-testid="maps-title">Offline Maps</h1>
        <p className="text-[#6a6a6a] text-sm mt-0.5">Download maps for offline navigation and explore without internet connection</p>
      </div>
      <OfflineMaps />
    </div>
  );
}
