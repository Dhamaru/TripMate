import { useState, useEffect } from "react";
import type { Trip, ItineraryDay, ItineraryActivity } from "@/types/api.types";
import { type IItineraryDay, type IItineraryActivity } from "@shared/schema";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  GripVertical,
  Clock,
  MapPin,
  Edit2,
  ChevronUp,
  ChevronDown,
  Trash2,
  Plus,
  Navigation,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { ActivityFormDialog } from "./ActivityFormDialog";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTripStore, useAuthStore } from "@/store";
import { ModelConfidenceBadge } from "./ModelConfidenceBadge";
import { AIReasoningPanel } from "./AIReasoningPanel";
import { AtlasDayButton } from "./AtlasDayButton";
import { VibeVoting } from "./VibeVoting";
import { useLocation } from "wouter";
import { parseTimeToMinutes } from "@/lib/time";
import { getCurrencySymbol } from "@/lib/currency";

interface ItineraryManagerProps {
  trip: Trip;
  // Switches TripDetail to the Map tab and flies to this activity's pin.
  // Optional — omitted entirely wherever ItineraryManager might render
  // without a sibling map (there's currently only the one usage, but no
  // reason to make this a hard requirement).
  onViewOnMap?: (lat: number, lon: number) => void;
  // The reverse flow — set from a map pin's "Edit" click, scrolls to and
  // briefly highlights that activity's row. highlightNonce bumps on every
  // click (even of the same activity twice in a row) since highlightActivityId
  // alone wouldn't change reference/value the second time.
  highlightActivityId?: string | null;
  highlightNonce?: number;
  // For a restaurant/cafe/hotel, a bare map pin is the wrong destination —
  // the Places tab is where the actual useful info (ratings, address,
  // website) lives. Sightseeing/temple/museum/park/market still go to the
  // map, which is what they're actually well-served by.
  onViewInPlaces?: (category: "food" | "hotels", placeName?: string) => void;
}

// Sortable Item Component with Move Buttons
function SortableActivity({
  activity,
  index,
  total,
  onEdit,
  onDelete,
  onMove,
  tripId,
  dayIndex,
  canEdit,
  onViewOnMap,
  isHighlighted,
  onViewInPlaces,
  currency,
}: {
  activity: IItineraryActivity;
  index: number;
  total: number;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (direction: "up" | "down") => void;
  tripId: string;
  dayIndex: number;
  canEdit: boolean;
  onViewOnMap?: (lat: number, lon: number) => void;
  isHighlighted?: boolean;
  onViewInPlaces?: (category: "food" | "hotels", placeName?: string) => void;
  currency?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: activity.id,
  });

  // Same fallback field names TripMap.tsx's own marker-placement code
  // already tolerates — activities saved before the addActivitySchema fix
  // (server/schemas/itinerary.schemas.ts) may still carry latitude/
  // longitude instead of lat/lon.
  const viewLat = activity.lat ?? activity.latitude;
  const viewLon = activity.lon ?? activity.lng ?? activity.longitude;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isTravelLeg = activity.type === "travel";

  const typeColors: Record<string, string> = {
    travel: "border-[rgb(var(--amber-rgb)/50%)] text-[var(--amber)]",
    food: "border-[rgb(var(--forest-rgb)/50%)] text-[var(--forest)]",
    sightseeing: "border-[rgb(var(--explorer-blue-rgb)/50%)] text-[var(--explorer-blue)]",
    accommodation: "border-purple-500/50 text-purple-400",
    activity: "border-[hsl(var(--muted-foreground))]/50 text-[hsl(var(--muted-foreground))]",
  };
  const typeLabel: Record<string, string> = {
    travel: "Travel",
    food: "Food",
    sightseeing: "Sight",
    accommodation: "Stay",
    activity: "Activity",
  };
  const typeClass = typeColors[activity.type || "activity"] || typeColors.activity;

  return (
    <div
      ref={setNodeRef}
      id={`itinerary-activity-${activity.id}`}
      style={style}
      className={`flex items-center gap-2 px-3 py-2.5 border-b border-[hsl(var(--border))] last:border-0 transition-colors group ${isHighlighted ? "bg-[rgb(var(--explorer-blue-rgb)/15%)]" : isTravelLeg ? "bg-[rgb(var(--amber-rgb)/5%)]" : "hover:bg-[hsl(var(--muted))]/50"}`}
    >
      {/* Drag handle — viewers can't reorder either */}
      {canEdit && (
        <div
          {...attributes}
          {...listeners}
          className="shrink-0 text-[hsl(var(--muted-foreground))]/40 cursor-grab active:cursor-grabbing hover:text-[hsl(var(--muted-foreground))] transition-colors"
        >
          <GripVertical className="w-4 h-4" />
        </div>
      )}

      {/* Time badge */}
      {activity.time && (
        <div className="shrink-0 text-[10px] font-mono-data bg-[hsl(var(--muted))] px-2 py-0.5 rounded text-[hsl(var(--muted-foreground))] w-14 text-center">
          {activity.time}
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Live-measured at 375px: the title span was the only non-shrink-0
            child in this row (the type stamp/duration/cost pills all have
            shrink-0), so inside an already-narrow min-w-0 column it
            absorbed the entire squeeze and rendered as a single clipped
            character. basis-full at phone width forces it onto its own
            line in this already-flex-wrap row instead of being crushed;
            sm:basis-auto lets it share the line again once there's room. */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {isTravelLeg && (activity.from || activity.to) ? (
            <>
              {activity.from && (
                <span className="text-sm font-medium text-foreground">{activity.from}</span>
              )}
              {activity.from && activity.to && (
                <span className="text-[var(--amber)] text-xs">→</span>
              )}
              {activity.to && (
                <span className="text-sm font-medium text-foreground">{activity.to}</span>
              )}
            </>
          ) : (
            <span className="basis-full sm:basis-auto min-w-0 text-sm font-medium text-foreground truncate">
              {activity.title || activity.placeName}
            </span>
          )}
          <span className={`stamp text-[9px] px-1.5 py-0 shrink-0 ${typeClass}`}>
            {typeLabel[activity.type || "activity"] || "Activity"}
          </span>
          {activity.duration_minutes && (
            <span className="text-[10px] font-mono-data text-[hsl(var(--muted-foreground))] shrink-0">
              <Clock className="inline w-2.5 h-2.5 mr-0.5" />
              {activity.duration_minutes}m
            </span>
          )}
          {/* Est. cost — parsed/generated activities (Import My Plan,
              Let AI Plan, Atlas) carry cost/entryFee, but this view never
              showed either; the pre-save preview did (ImportPlanPreview.tsx),
              live-reported as itinerary details feeling less complete after
              confirming the trip. */}
          {(activity.cost || activity.entryFee) && (
            <span className="text-[10px] font-mono-data text-[var(--emerald-horizon)] shrink-0">
              ~{getCurrencySymbol(currency)}
              {activity.cost || activity.entryFee}
            </span>
          )}
        </div>
        {activity.location && (
          <div className="flex items-center gap-1 text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5 truncate">
            <MapPin className="w-2.5 h-2.5 shrink-0" />
            {activity.location}
          </div>
        )}
      </div>

      {/* Vibe vote — inline, compact */}
      <VibeVoting
        tripId={tripId}
        dayIndex={dayIndex}
        activityId={activity.id}
        initialVotes={activity.votes}
      />

      {/* View on Map / View in Places — a read action, so shown to
                viewer-role collaborators too (unlike Edit/Delete below). A
                restaurant/cafe/hotel's useful info (ratings, address,
                website) lives in the Places tab, not a bare map pin — only
                sightseeing/temple/museum/park/market/generic activities go
                to the map. */}
      {(() => {
        const type = (activity.type || "").toLowerCase();
        const isFoodOrStay = type === "restaurant" || type === "cafe" || type === "accommodation";
        if (isFoodOrStay && onViewInPlaces) {
          return (
            <div className="flex items-center shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  onViewInPlaces(
                    type === "accommodation" ? "hotels" : "food",
                    activity.placeName || activity.title,
                  );
                }}
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-[hsl(var(--muted-foreground))] hover:text-[var(--explorer-blue)]"
                title={
                  type === "accommodation"
                    ? "View in Places (Hotels)"
                    : "View in Places (Restaurants)"
                }
              >
                <MapPin className="w-3.5 h-3.5" />
              </Button>
            </div>
          );
        }
        if (!isFoodOrStay && onViewOnMap && viewLat != null && viewLon != null) {
          return (
            <div className="flex items-center shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  onViewOnMap(viewLat as number, viewLon as number);
                }}
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-[hsl(var(--muted-foreground))] hover:text-[var(--explorer-blue)]"
                title="View on map"
              >
                <Navigation className="w-3.5 h-3.5" />
              </Button>
            </div>
          );
        }
        return null;
      })()}

      {/* Edit/Delete — viewer-role collaborators can't mutate the
                itinerary (enforced server-side too), so don't show controls
                that would just fail. */}
      {canEdit && (
        <div className="flex items-center shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
          <Button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-[hsl(var(--muted-foreground))] hover:text-foreground"
            title="Edit"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-[hsl(var(--muted-foreground))] hover:text-red-400"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

export function ItineraryManager({
  trip,
  onViewOnMap,
  highlightActivityId,
  highlightNonce,
  onViewInPlaces,
}: ItineraryManagerProps) {
  const [itinerary, setItinerary] = useState<IItineraryDay[]>((trip.itinerary as any) || []);
  const [dialogOpen, setDialogOpen] = useState(false);
  // "Edit" clicked on a map pin's popup — scroll to and briefly highlight
  // that row so it's obvious which activity got jumped to, mirroring the
  // fly-to+popup TripMap does for the opposite direction (Itinerary -> Map).
  const [highlightedRowId, setHighlightedRowId] = useState<string | null>(null);
  useEffect(() => {
    if (!highlightActivityId) return;
    const el = document.getElementById(`itinerary-activity-${highlightActivityId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedRowId(highlightActivityId);
    const t = setTimeout(() => setHighlightedRowId(null), 2500);
    return () => clearTimeout(t);
  }, [highlightActivityId, highlightNonce]);
  const [editingActivity, setEditingActivity] = useState<{
    dayIndex: number;
    activity: IItineraryActivity | null;
  } | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);

  // The server already rejects mutations from viewer-role collaborators
  // (403/404), but the Edit/Delete/Add controls were rendered unconditionally
  // regardless of role — a viewer could click Delete, see a (now-fixed) false
  // "Activity deleted" success toast, and have no idea nothing actually
  // happened. Compute it here too so those controls aren't even shown.
  const { user } = useAuthStore();
  const currentUserId = String((user as any)?._id || (user as any)?.id || "");
  const isOwner = String((trip as any).userId) === currentUserId;
  const collaboratorEntry = trip.collaborators?.find((c) => {
    const cId =
      typeof c.userId === "string"
        ? c.userId
        : String((c.userId as any)?._id || (c.userId as any)?.id || "");
    return cId === currentUserId;
  });
  const canEdit = isOwner || collaboratorEntry?.role === "editor";

  /**
   * Validates that the itinerary is chronologically sound and flags overlaps.
   */
  const validateChronology = (
    activities: IItineraryActivity[],
  ): { valid: boolean; errorIndex: number | null; type: "chronology" | "overlap" | null } => {
    for (let i = 0; i < activities.length - 1; i++) {
      const current = activities[i];
      const next = activities[i + 1];

      const currentStart = parseTimeToMinutes(current.time || "09:00 AM");
      const currentEnd = currentStart + (current.duration_minutes || 60);
      const nextStart = parseTimeToMinutes(next.time || "10:00 AM");

      // Chronology Check: Next activity cannot start before current activity starts
      if (nextStart < currentStart) {
        return { valid: false, errorIndex: i + 1, type: "chronology" };
      }

      // Overlap Check: Next activity starts before current activity ends
      if (nextStart < currentEnd) {
        return { valid: false, errorIndex: i + 1, type: "overlap" };
      }
    }
    return { valid: true, errorIndex: null, type: null };
  };
  const { toast } = useToast();

  // Sync state with props ONLY when trip ID changes or local state is empty
  // This prevents refetches from overwriting active UI transitions/mutations
  useEffect(() => {
    const hasLocalActivities = itinerary.some((d) => d.activities?.length > 0);
    const hasIncomingActivities =
      trip.itinerary &&
      trip.itinerary.length > 0 &&
      trip.itinerary.some((d) => d.activities?.length > 0);

    if (!trip.itinerary || trip.itinerary.length === 0) {
      // Only initialize empty if we don't have local data either
      if (!hasLocalActivities) {
        console.log("[ItineraryManager] DEBUG: Initializing empty itinerary");
        const emptyItinerary: IItineraryDay[] = [];
        for (let i = 0; i < trip.days; i++) {
          emptyItinerary.push({ dayIndex: i, day: i + 1, activities: [] });
        }
        setItinerary(emptyItinerary);
      }
    } else if (hasIncomingActivities || !hasLocalActivities) {
      // Only overwrite if incoming has data OR local is empty
      // This allows optimistic updates from mutations to persist while refetching
      setItinerary(trip.itinerary as any);
    }
  }, [trip.itinerary, trip.days, trip.id]);

  // DnD Sensors
  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 2000,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const moveActivity = (dayIndex: number, actIndex: number, direction: "up" | "down") => {
    const newItinerary = [...itinerary];
    const dayActivities = [...newItinerary[dayIndex].activities];

    const targetIndex = direction === "up" ? actIndex - 1 : actIndex + 1;

    if (targetIndex >= 0 && targetIndex < dayActivities.length) {
      const moved = arrayMove(dayActivities, actIndex, targetIndex);

      // Validate Logic Phase
      const validation = validateChronology(moved);
      if (!validation.valid) {
        toast({
          title: validation.type === "chronology" ? "Chronological Error" : "Scheduling Conflict",
          description: `Activity "${moved[validation.errorIndex!].title}" starts before the previous one ends.`,
          variant: "destructive",
        });
      }
      newItinerary[dayIndex] = { ...newItinerary[dayIndex], activities: moved };
      setItinerary(newItinerary);
      saveItinerary(newItinerary);
    }
  };

  const handleDragEnd = (event: DragEndEvent, dayIndex: number) => {
    const { active, over } = event;

    if (active && over && active.id !== over.id) {
      const dayActivities = itinerary[dayIndex].activities;
      const oldIndex = dayActivities.findIndex((item) => item.id === active.id);
      const newIndex = dayActivities.findIndex((item) => item.id === over.id);

      const newActivities = arrayMove(dayActivities, oldIndex, newIndex);

      // Validate chronological order before saving
      const validation = validateChronology(newActivities);
      if (!validation.valid) {
        toast({
          title: "Architecture Logic Alert",
          description: "This move creates a time overlap or chronological error.",
          variant: "destructive",
        });
        setConflictError("This move creates a time overlap or chronological conflict.");
        return;
      }
      setConflictError(null);

      const updated = itinerary.map((d, idx) =>
        idx === dayIndex ? { ...d, activities: newActivities } : d,
      ) as IItineraryDay[];
      setItinerary(updated);
      saveItinerary(updated);
    }
  };

  const handleEditActivity = (dayIndex: number, actIndex: number) => {
    const activity = itinerary[dayIndex].activities[actIndex];
    setEditingActivity({ dayIndex, activity });
    setDialogOpen(true);
  };

  const handleAddActivity = (dayIndex: number) => {
    setEditingActivity({ dayIndex, activity: null });
    setDialogOpen(true);
  };

  const handleDeleteActivity = (dayIndex: number, actIndex: number) => {
    const activity = itinerary[dayIndex].activities[actIndex];
    deleteActivityMutation.mutate({ dayIndex, activityId: activity.id });
  };

  // apiRequest() is a raw fetch wrapper — it does NOT throw on a non-2xx
  // response. Every mutation below used to call response.json() straight
  // through and treat whatever came back as success data, including a
  // 403/404 permission-denied body from the server (e.g. a viewer-role
  // collaborator hitting the editor-only itinerary routes) — the mutation
  // still ran onSuccess and showed a false "Activity updated"/"deleted"
  // toast even though nothing actually changed. Throw on !response.ok so
  // onError fires with the real reason instead.
  async function parseOrThrow(response: Response) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || `Request failed (${response.status})`);
    }
    return data;
  }

  // Add Activity Mutation
  const addActivityMutation = useMutation({
    mutationFn: async ({ dayIndex, activity }: { dayIndex: number; activity: any }) => {
      const response = await apiRequest("POST", `/api/v1/trips/${trip.id}/itinerary/activity`, {
        dayIndex,
        activity,
      });
      return parseOrThrow(response);
    },
    onSuccess: (data) => {
      setItinerary(data.itinerary);
      useTripStore.getState().fetchTrip(trip.id!);
      toast({ title: "Activity added", description: "Activity has been added to your itinerary." });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to add activity.",
        variant: "destructive",
      });
    },
  });

  // Update Activity Mutation
  const updateActivityMutation = useMutation({
    mutationFn: async ({
      dayIndex,
      activityId,
      updates,
    }: {
      dayIndex: number;
      activityId: string;
      updates: any;
    }) => {
      const response = await apiRequest(
        "PUT",
        `/api/v1/trips/${trip.id}/itinerary/activity/${activityId}`,
        {
          dayIndex,
          data: updates,
        },
      );
      return parseOrThrow(response);
    },
    onSuccess: (data) => {
      setItinerary(data.itinerary);
      useTripStore.getState().fetchTrip(trip.id!);
      toast({ title: "Activity updated", description: "Activity has been updated." });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to update activity.",
        variant: "destructive",
      });
    },
  });

  // Delete Activity Mutation
  const deleteActivityMutation = useMutation({
    mutationFn: async ({ dayIndex, activityId }: { dayIndex: number; activityId: string }) => {
      const response = await apiRequest(
        "DELETE",
        `/api/v1/trips/${trip.id}/itinerary/activity/${activityId}`,
        { dayIndex },
      );
      return parseOrThrow(response);
    },
    onSuccess: (data) => {
      setItinerary(data.itinerary);
      useTripStore.getState().fetchTrip(trip.id!);
      toast({
        title: "Activity deleted",
        description: "Activity has been removed from your itinerary.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to delete activity.",
        variant: "destructive",
      });
    },
  });

  const handleSaveActivity = (activity: any) => {
    if (!editingActivity) return;

    if (editingActivity.activity) {
      // Edit mode
      updateActivityMutation.mutate({
        dayIndex: editingActivity.dayIndex,
        activityId: editingActivity.activity.id,
        updates: activity,
      });
    } else {
      // Add mode
      addActivityMutation.mutate({
        dayIndex: editingActivity.dayIndex,
        activity,
      });
    }
  };

  const saveItinerary = async (updated: IItineraryDay[]) => {
    try {
      const response = await apiRequest("PUT", `/api/v1/trips/${trip.id}/itinerary/reorder`, {
        itinerary: updated,
      });
      await parseOrThrow(response);
      useTripStore.getState().fetchTrip(trip.id!);
    } catch (e: any) {
      console.error("Failed to save itinerary", e);
      // Re-sync from the server — the drag-and-drop already reordered
      // the local state optimistically, so on failure (e.g. a
      // viewer-role collaborator whose reorder was rejected) it has to
      // be pulled back to what's actually saved, not left showing an
      // order that was never persisted.
      useTripStore.getState().fetchTrip(trip.id!);
      toast({
        title: "Error",
        description: e?.message || "Failed to save the reordered itinerary.",
        variant: "destructive",
      });
    }
  };

  // If no days and no itinerary, show message. But usually trip.days is at least 1.
  if (!itinerary || itinerary.length === 0) {
    if (trip.days > 0) {
      // Should be handled by useEffect above, but safe fallback
      const emptyItinerary: IItineraryDay[] = [];
      for (let i = 0; i < trip.days; i++) {
        emptyItinerary.push({ dayIndex: i, day: i + 1, activities: [] });
      }
      setItinerary(emptyItinerary);
      return null; // Next render will show cards
    }
    return (
      <div className="text-muted-foreground text-center pt-8 pb-8 bg-secondary/20 rounded-xl border border-dashed border-border">
        No itinerary generated yet.
      </div>
    );
  }

  const tripStartDate = (trip as any).startDate ? new Date((trip as any).startDate) : null;

  const getDayLabel = (dayIdx: number, day: IItineraryDay): string => {
    // Use the day's own date if present
    if (day.date) {
      const d = new Date(day.date);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString("en-IN", { month: "short", day: "numeric", weekday: "short" });
      }
    }
    // Compute from trip startDate
    if (tripStartDate) {
      const d = new Date(tripStartDate);
      d.setDate(d.getDate() + dayIdx);
      return d.toLocaleDateString("en-IN", { month: "short", day: "numeric", weekday: "short" });
    }
    return "";
  };

  return (
    <div className="space-y-6">
      {itinerary.map((day, dayIdx) => {
        const dateLabel = getDayLabel(dayIdx, day);
        return (
          <div
            key={dayIdx}
            className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] mb-4 overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 bg-[hsl(var(--muted))]/50 perforated-edge">
              <div className="flex items-center gap-2">
                <h3 className="font-display font-bold text-foreground tracking-tight">
                  Day {day.day || dayIdx + 1}
                </h3>
                {dateLabel && (
                  <span className="stamp text-[10px] text-[var(--amber)]">{dateLabel}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono-data text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))] px-2 py-1 rounded-full">
                  {day.activities.length} Activities
                </span>
                {canEdit && (
                  <Button
                    onClick={() => handleAddActivity(dayIdx)}
                    size="sm"
                    className="bg-[var(--amber)] hover:bg-[var(--airbnb-primary-active)] text-white flex items-center gap-1 rounded-lg text-xs font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Add Activity</span>
                  </Button>
                )}
              </div>
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => handleDragEnd(e, dayIdx)}
            >
              <SortableContext
                items={day.activities.map((a) => a.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col">
                  {day.activities.map((activity, actIdx) => (
                    <SortableActivity
                      key={activity.id || `temp-${actIdx}`}
                      activity={activity}
                      index={actIdx}
                      total={day.activities.length}
                      onEdit={() => handleEditActivity(dayIdx, actIdx)}
                      onDelete={() => handleDeleteActivity(dayIdx, actIdx)}
                      canEdit={canEdit}
                      onMove={(dir) => moveActivity(dayIdx, actIdx, dir)}
                      tripId={String(trip.id)}
                      dayIndex={dayIdx}
                      onViewOnMap={onViewOnMap}
                      isHighlighted={highlightedRowId === activity.id}
                      onViewInPlaces={onViewInPlaces}
                      currency={trip.currency}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {conflictError && (
              <p
                className="mx-4 mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400 flex items-center gap-2 mt-4"
                role="alert"
                aria-live="assertive"
              >
                ⚠️ {conflictError}
              </p>
            )}

            <div className="mt-4">
              {/* Atlas Day Optimization + AI Metadata */}
              <AtlasDayButton
                dayIndex={dayIdx}
                destination={trip.destination}
                activities={
                  (day.activities || []).map((a) => ({
                    id: String(a.id),
                    time: a.time || "",
                    placeName: a.title || a.placeName || "",
                    location: a.location || "",
                    type: a.type || "activity",
                    lat: "lat" in a ? Number(a.lat) : 0,
                    lon: "lon" in (a as any) ? Number((a as any).lon) : 0,
                  })) as any[]
                }
                tripId={String(trip.id)}
              />
              {(day.confidenceScore || day.reasoning) && (
                <div className="px-4 pb-4 flex flex-col gap-2">
                  {day.confidenceScore && (
                    <div className="flex items-center gap-2">
                      <ModelConfidenceBadge
                        confidence={
                          day.confidenceScore === "high"
                            ? "High"
                            : day.confidenceScore === "medium"
                              ? "Medium"
                              : "Low"
                        }
                      />
                    </div>
                  )}
                  {day.reasoning && (
                    <AIReasoningPanel
                      reasoning={day.reasoning}
                      dayIndex={dayIdx}
                      confidence={
                        day.confidenceScore === "high"
                          ? "High"
                          : day.confidenceScore === "medium"
                            ? "Medium"
                            : "Low"
                      }
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      <ActivityFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        activity={editingActivity?.activity}
        dayIndex={editingActivity?.dayIndex || 0}
        onSave={handleSaveActivity}
        currency={trip.currency}
        destination={trip.destination}
      />
    </div>
  );
}
