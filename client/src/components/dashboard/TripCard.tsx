import { useState } from "react";
import { useLocation } from "wouter";
import { useTripStore } from "../../store";
import { OptimizedImage } from "../ui/OptimizedImage";

const STYLE_ICONS: Record<string, string> = {
  Luxury: "✨",
  Adventure: "🏔",
  Budget: "💰",
  Relaxed: "🌴",
  Cultural: "🎭",
  Family: "👨👩👧",
};
const MEDIUM_ICONS: Record<string, string> = {
  Flight: "✈️",
  Train: "🚂",
  RoadTrip: "🚗",
};

// One .stamp status badge, keyed on the trip's own `status` field — the
// authoritative source (design-audit finding: the app had 4 different
// status-badge implementations; this is the one call site staying as
// this component ships, the rest get consolidated separately). Was
// previously computed from startDate/endDate via getTripStatus(), which
// also crashed (Invalid Date -> toISOString() throws) on any trip
// without persisted dates — a real shape on drafts/AI-generated trips,
// not just a hypothetical.
const STATUS_STAMP: Record<string, { label: string; className: string }> = {
  planning: { label: "Planning", className: "bg-[#1D4E89]/15 text-[#4F82C4] border-[#1D4E89]/50" },
  active: {
    label: "Active",
    className: "bg-[#3D9467]/15 text-[#3D9467] border-[#3D9467]/50 animate-pulse",
  },
  completed: {
    label: "Completed",
    className: "bg-[#B3261E]/15 text-[#B3261E] border-[#B3261E]/50",
  },
};

function formatDateRangeSafe(startDate?: Date | string, endDate?: Date | string): string {
  if (!startDate || !endDate) return "Dates TBD";
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return "Dates TBD";
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString("en-US", opts)} — ${end.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
}

function durationDaysSafe(startDate?: Date | string, endDate?: Date | string, fallback?: number) {
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    }
  }
  return fallback ?? undefined;
}

export function TripCard({
  trip,
}: {
  trip: {
    id?: string;
    _id?: unknown;
    destination: string;
    imageUrl?: string;
    startDate?: Date | string;
    endDate?: Date | string;
    days?: number;
    travelStyle?: string;
    transportMode?: string;
    groupSize?: number;
    status?: string;
  };
}) {
  const [, navigate] = useLocation();
  const { deleteTrip } = useTripStore();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const tripId = trip.id ?? (trip._id != null ? String(trip._id) : undefined);
  const stamp = STATUS_STAMP[trip.status ?? "planning"] ?? STATUS_STAMP.planning;
  const duration = durationDaysSafe(trip.startDate, trip.endDate, trip.days);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!showConfirm) {
      setShowConfirm(true);
      setTimeout(() => setShowConfirm(false), 3000);
      return;
    }
    if (!tripId) return;
    setIsDeleting(true);
    await deleteTrip(tripId);
  };

  return (
    <div
      className="relative group rounded-2xl overflow-hidden cursor-pointer aspect-[3/4] bg-card border border-border transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl"
      onClick={() => tripId && navigate(`/app/trips/${tripId}`)}
      role="article"
      aria-label={`Trip to ${trip.destination}`}
    >
      {trip.imageUrl ? (
        <OptimizedImage
          src={trip.imageUrl}
          alt={trip.destination}
          className="absolute inset-0"
          fallback={
            <div className="absolute inset-0 bg-gradient-to-br from-[#1D4E89] to-blue-900" />
          }
        />
      ) : (
        <div
          className="absolute inset-0 bg-gradient-to-br from-[#1D4E89] to-blue-900 flex items-center justify-center text-5xl opacity-20"
          aria-hidden="true"
        >
          🌍
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

      <div className="absolute top-3 right-3">
        <span
          className={`stamp text-[10px] ${stamp.className}`}
          aria-label={`Trip status: ${stamp.label}`}
        >
          {stamp.label}
        </span>
      </div>

      <button
        className={`absolute top-3 left-3 w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all duration-200 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 ${showConfirm ? "bg-red-500 text-white" : "bg-black/40 text-white/60 hover:bg-red-500/80 hover:text-white"}`}
        onClick={handleDelete}
        disabled={isDeleting}
        aria-label={showConfirm ? "Confirm delete trip" : `Delete trip to ${trip.destination}`}
      >
        {isDeleting ? "↻" : showConfirm ? "✓" : "🗑"}
      </button>

      <div className="absolute bottom-0 left-0 right-0 p-4 perforated-edge bg-black/40 backdrop-blur-sm border-t border-white/20">
        <h3 className="text-white font-semibold font-display text-base leading-tight mb-1 line-clamp-2">
          {trip.destination}
        </h3>
        <p className="text-white/80 text-xs font-mono-data mb-3 tracking-wide">
          {formatDateRangeSafe(trip.startDate, trip.endDate)}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {[
            duration != null ? `${duration}d` : null,
            trip.travelStyle
              ? `${STYLE_ICONS[trip.travelStyle] ?? "🧳"} ${trip.travelStyle}`
              : null,
            trip.transportMode
              ? `${MEDIUM_ICONS[trip.transportMode] ?? "🚀"} ${trip.transportMode}`
              : null,
            trip.groupSize != null ? `👥 ${trip.groupSize}` : null,
          ]
            .filter((chip): chip is string => Boolean(chip))
            .map((chip, i) => (
              <span
                key={i}
                className="text-xs px-2 py-0.5 rounded-[4px] font-mono-data bg-black/40 text-white/90 border border-white/20"
              >
                {chip}
              </span>
            ))}
        </div>
      </div>
    </div>
  );
}
