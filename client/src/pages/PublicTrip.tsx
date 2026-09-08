import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { TripMateLogo } from "@/components/TripMateLogo";
import { OptimizedImage } from "@/components/ui/OptimizedImage";
import { Clock, Users, MapPin, ArrowRight } from "lucide-react";

// UX-audit finding: the share backend (POST /:id/share, GET
// /public/:shareId, both already hardened — see trips.controller.ts's
// field allowlist + per-activity userVotes strip) had zero client route
// to reach it. A generated link 404'd into NotFound. This is the missing
// public, unauthenticated view — read-only, no edit affordances, no
// account required.
interface PublicTrip {
  destination: string;
  days: number;
  startDate?: string;
  endDate?: string;
  groupSize: number;
  travelStyle: string;
  currency?: string;
  imageUrl?: string;
  imageCaption?: string;
  itinerary?: Array<{
    day?: number;
    dayIndex?: number;
    date?: string;
    activities: Array<{
      id?: string;
      title?: string;
      placeName?: string;
      time?: string;
      type?: string;
    }>;
  }>;
}

export default function PublicTripPage() {
  const { shareId } = useParams<{ shareId: string }>();

  const {
    data: trip,
    isLoading,
    error,
  } = useQuery<PublicTrip>({
    queryKey: [`/api/v1/trips/public/${shareId}`],
    retry: false,
  });

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] font-sans-clean">
      <header className="border-b border-[hsl(var(--border))] px-4 sm:px-6 py-4 flex items-center justify-between">
        <Link href="/">
          <TripMateLogo size="sm" />
        </Link>
        <Link
          href="/signup"
          className="stamp-press bg-[var(--amber)] hover:bg-[#0F2C52] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
        >
          Plan your own trip <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        {isLoading && (
          <div className="flex items-center justify-center py-24">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[var(--ink-blue)]" />
          </div>
        )}

        {!isLoading && (error || !trip) && (
          <div className="text-center py-24">
            <h1 className="font-display text-2xl font-bold mb-2">Trip not found</h1>
            <p className="text-[hsl(var(--muted-foreground))] mb-6">
              This link is invalid, or the trip is no longer shared publicly.
            </p>
            <Link href="/" className="text-[var(--ink-blue-bright)] font-semibold hover:underline">
              Go to TripMate
            </Link>
          </div>
        )}

        {!isLoading && trip && (
          <>
            <div className="rounded-2xl overflow-hidden border border-[hsl(var(--border))] mb-8 relative h-56">
              {trip.imageUrl ? (
                <OptimizedImage
                  src={trip.imageUrl}
                  alt={trip.destination}
                  className="w-full h-full"
                  fallback={<div className="hero-fallback-ink w-full h-full" />}
                />
              ) : (
                <div className="hero-fallback-ink w-full h-full" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute bottom-4 left-5 right-5">
                <span className="stamp text-[10px] mb-2 inline-block">Shared itinerary</span>
                <h1 className="font-display text-3xl font-bold text-white leading-tight">
                  {trip.destination}
                </h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-5 mb-10 text-sm text-[hsl(var(--muted-foreground))]">
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" /> {trip.days} days
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                {trip.groupSize === 1 ? "Solo" : `${trip.groupSize} travelers`}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4" /> {trip.travelStyle}
              </span>
            </div>

            {Array.isArray(trip.itinerary) && trip.itinerary.length > 0 ? (
              <div className="space-y-8">
                {trip.itinerary.map((day, i) => (
                  <div key={i} className="perforated-edge pb-8 last:border-0">
                    <h2 className="font-display text-xl font-bold mb-3">
                      Day {day.day ?? (day.dayIndex != null ? day.dayIndex + 1 : i + 1)}
                    </h2>
                    <div className="space-y-2">
                      {day.activities.map((activity, j) => (
                        <div
                          key={activity.id ?? j}
                          className="flex items-center gap-3 py-1.5 border-b border-[hsl(var(--border))] last:border-0"
                        >
                          {activity.time && (
                            <span className="font-mono-data text-xs text-[hsl(var(--muted-foreground))] w-14 flex-shrink-0">
                              {activity.time}
                            </span>
                          )}
                          <span className="text-sm">{activity.title || activity.placeName}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[hsl(var(--muted-foreground))] text-center py-12">
                No itinerary details shared yet.
              </p>
            )}

            <div className="mt-12 text-center border-t border-[hsl(var(--border))] pt-8">
              <p className="text-sm text-[hsl(var(--muted-foreground))] mb-3">
                Want to plan a trip like this?
              </p>
              <Link
                href="/signup"
                className="stamp-press inline-flex items-center gap-2 bg-[var(--amber)] hover:bg-[#0F2C52] text-white px-6 py-3 rounded-lg text-sm font-semibold transition-colors"
              >
                Get started with TripMate <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
