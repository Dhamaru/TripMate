import { useState } from "react";
import { useLocation } from "wouter";
import { useTripStore } from "../../store";
import { OptimizedImage } from "../ui/OptimizedImage";
import {
  Sparkles,
  Mountain,
  Wallet,
  Palmtree,
  Theater,
  Users,
  Plane,
  TrainFront,
  Car,
  Trash2,
  Check,
  RotateCw,
  ImageOff,
} from "lucide-react";

// No-Emoji Rule (DESIGN.md): real Lucide icons, one stroke-weight family.
const STYLE_ICONS: Record<string, typeof Sparkles> = {
  Luxury: Sparkles,
  Adventure: Mountain,
  Budget: Wallet,
  Relaxed: Palmtree,
  Cultural: Theater,
  Family: Users,
};
const MEDIUM_ICONS: Record<string, typeof Plane> = {
  Flight: Plane,
  Train: TrainFront,
  RoadTrip: Car,
};

// Tinted pill keyed on the trip's own `status` field.
const STATUS_STAMP: Record<string, { label: string; className: string }> = {
  planning: {
    label: "Planning",
    className:
      "bg-[rgb(var(--customs-blue-rgb)/14%)] text-[var(--customs-blue)] border border-[rgb(var(--customs-blue-rgb)/40%)]",
  },
  active: {
    label: "Active",
    className:
      "bg-[rgb(var(--transit-green-rgb)/14%)] text-[var(--transit-green)] border border-[rgb(var(--transit-green-rgb)/40%)]",
  },
  completed: {
    label: "Completed",
    className:
      "bg-[rgb(var(--stamp-red-rgb)/14%)] text-[var(--stamp-red)] border border-[rgb(var(--stamp-red-rgb)/40%)]",
  },
};

function formatDateRangeSafe(startDate?: Date | string, endDate?: Date | string): string {
  if (!startDate || !endDate) return "Dates not set";
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return "Dates not set";
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString("en-US", opts)} – ${end.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
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
  const StyleIcon = trip.travelStyle ? (STYLE_ICONS[trip.travelStyle] ?? Sparkles) : null;
  const MediumIcon = trip.transportMode ? (MEDIUM_ICONS[trip.transportMode] ?? Car) : null;

  const goToTrip = () => tripId && navigate(`/app/trips/${tripId}`);

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
      className="group rounded-2xl overflow-hidden cursor-pointer bg-card border border-border shadow-[var(--shadow-card)] transition-colors duration-200 hover:border-[var(--ink-blue)]/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ink-blue)] focus-visible:outline-offset-2"
      onClick={goToTrip}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          goToTrip();
        }
      }}
      aria-label={`Trip to ${trip.destination}`}
    >
      {/* Photo band */}
      <div className="relative aspect-[16/10] bg-[hsl(var(--muted))]">
        {trip.imageUrl ? (
          <OptimizedImage
            src={trip.imageUrl}
            alt={trip.destination}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
            fallback={
              <div className="absolute inset-0 flex items-center justify-center text-[hsl(var(--muted-foreground))]">
                <ImageOff className="w-6 h-6" aria-hidden="true" />
              </div>
            }
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center text-[hsl(var(--muted-foreground))]"
            aria-hidden="true"
          >
            <ImageOff className="w-6 h-6" />
          </div>
        )}

        <span
          className={`absolute top-2.5 right-2.5 text-[10px] font-mono-data uppercase tracking-[0.08em] px-2 py-0.5 rounded-full backdrop-blur-sm ${stamp.className}`}
          aria-label={`Trip status: ${stamp.label}`}
        >
          {stamp.label}
        </span>

        <button
          className={`absolute top-2.5 left-2.5 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 ${
            showConfirm
              ? "bg-[var(--stamp-red-deep)] text-white"
              : "bg-black/45 text-white/80 hover:bg-[var(--stamp-red-deep)] hover:text-white backdrop-blur-sm"
          }`}
          onClick={handleDelete}
          disabled={isDeleting}
          aria-label={showConfirm ? "Confirm delete trip" : `Delete trip to ${trip.destination}`}
        >
          {isDeleting ? (
            <RotateCw className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : showConfirm ? (
            <Check className="w-4 h-4" aria-hidden="true" />
          ) : (
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className="font-display text-base font-semibold text-[hsl(var(--foreground))] leading-tight line-clamp-1">
          {trip.destination}
        </h3>
        <p className="text-xs font-mono-data text-[hsl(var(--muted-foreground))] mt-1">
          {formatDateRangeSafe(trip.startDate, trip.endDate)}
        </p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[11px] text-[hsl(var(--muted-foreground))] font-sans-clean">
          {duration != null && (
            <span className="font-mono-data">
              {duration} {duration === 1 ? "day" : "days"}
            </span>
          )}
          {trip.travelStyle && StyleIcon && (
            <span className="inline-flex items-center gap-1">
              <StyleIcon className="w-3 h-3" aria-hidden="true" />
              {trip.travelStyle}
            </span>
          )}
          {trip.transportMode && MediumIcon && (
            <span className="inline-flex items-center gap-1">
              <MediumIcon className="w-3 h-3" aria-hidden="true" />
              {trip.transportMode}
            </span>
          )}
          {trip.groupSize != null && (
            <span className="inline-flex items-center gap-1">
              <Users className="w-3 h-3" aria-hidden="true" />
              {trip.groupSize}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
