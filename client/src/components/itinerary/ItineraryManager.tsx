import { useState, useEffect } from "react";
import type { Trip, ItineraryDay, ItineraryActivity } from "@/types/api.types";
import { type IItineraryDay, type IItineraryActivity } from "@shared/schema";
import { DndContext, closestCenter, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GripVertical, Clock, MapPin, Edit2, ChevronUp, ChevronDown, Trash2, Plus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { ActivityFormDialog } from "./ActivityFormDialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ModelConfidenceBadge } from "./ModelConfidenceBadge";
import { AIReasoningPanel } from "./AIReasoningPanel";
import { AtlasDayButton } from "./AtlasDayButton";
import { VibeVoting } from "./VibeVoting";
import { useLocation } from "wouter";

interface ItineraryManagerProps {
    trip: Trip;
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
    dayIndex
}: {
    activity: IItineraryActivity;
    index: number;
    total: number;
    onEdit: () => void;
    onDelete: () => void;
    onMove: (direction: 'up' | 'down') => void;
    tripId: string;
    dayIndex: number;
}) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: activity.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const isTravelLeg = activity.type === 'travel';

    return (
        <div ref={setNodeRef} style={style} className={`flex items-start gap-3 px-4 py-3 border-b border-white/5 last:border-0 transition-colors group relative ${isTravelLeg ? 'bg-[#06e0f9]/5 hover:bg-[#06e0f9]/8' : 'hover:bg-white/5'}`}>
            <div {...attributes} {...listeners} className="shrink-0 w-11 h-11 flex items-center justify-center text-gray-600 cursor-grab active:cursor-grabbing hover:text-gray-400 transition-colors">
                <GripVertical className="w-5 h-5" />
            </div>

            <div className="flex-1 min-w-0 flex items-start gap-3">
                {activity.time && (
                    <div className="shrink-0 text-xs font-mono bg-white/10 px-2 py-1 rounded text-gray-300 w-14 text-center mt-0.5">
                        {activity.time}
                    </div>
                )}

                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                        <div className="flex-1 min-w-0">
                            {isTravelLeg && (activity.from || activity.to) ? (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    {activity.from && <span className="font-medium text-white">{activity.from}</span>}
                                    {activity.from && activity.to && <span className="text-[#06e0f9] text-sm">→</span>}
                                    {activity.to && <span className="font-medium text-white">{activity.to}</span>}
                                    <span className="text-xs text-[#06e0f9] bg-[#06e0f9]/10 px-1.5 py-0.5 rounded-full ml-1">Travel</span>
                                </div>
                            ) : (
                                <h4 className="font-medium text-white break-words">{activity.title || activity.placeName}</h4>
                            )}
                            {isTravelLeg && activity.title && (activity.from || activity.to) && (
                                <p className="text-xs text-gray-400 mt-0.5">{activity.title}</p>
                            )}
                        </div>

                        <div className="flex items-center opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                                onClick={(e) => { e.stopPropagation(); onMove('up'); }}
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-gray-500 hover:text-[#06e0f9] disabled:opacity-30"
                                disabled={index === 0}
                                title="Move Up"
                            >
                                <ChevronUp className="w-4 h-4" />
                            </Button>
                            <Button
                                onClick={(e) => { e.stopPropagation(); onMove('down'); }}
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-gray-500 hover:text-[#06e0f9] disabled:opacity-30"
                                disabled={index === total - 1}
                                title="Move Down"
                            >
                                <ChevronDown className="w-4 h-4" />
                            </Button>
                            <Button onClick={(e) => { e.stopPropagation(); onEdit(); }} variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:text-white" title="Edit">
                                <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button onClick={(e) => { e.stopPropagation(); onDelete(); }} variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:text-red-500" title="Delete">
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                    {activity.location && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                            <MapPin className="w-3 h-3" /> {activity.location}
                        </div>
                    )}
                    {activity.notes && <p className="text-sm text-gray-400 mt-2 line-clamp-2">{activity.notes}</p>}

                    <VibeVoting
                        tripId={tripId}
                        dayIndex={dayIndex}
                        activityId={activity.id}
                        initialVotes={activity.votes}
                    />
                </div>
            </div>
        </div>
    );
}

export function ItineraryManager({ trip }: ItineraryManagerProps) {
    const [itinerary, setItinerary] = useState<IItineraryDay[]>((trip.itinerary as any) || []);
    const [isSaving, setIsSaving] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingActivity, setEditingActivity] = useState<{ dayIndex: number; activity: IItineraryActivity | null } | null>(null);
    const [conflictError, setConflictError] = useState<string | null>(null);

    /**
     * Helper to parse "HH:MM AM/PM" into minutes from midnight.
     */
    const parseTimeToMinutes = (timeStr?: string): number => {
        if (!timeStr) return 0;
        try {
            const [time, modifier] = timeStr.split(' ');
            let [hours, minutes] = time.split(':').map(Number);
            if (modifier === 'PM' && hours < 12) hours += 12;
            if (modifier === 'AM' && hours === 12) hours = 0;
            return hours * 60 + (minutes || 0);
        } catch (e) {
            return 0;
        }
    };

    /**
     * Validates that the itinerary is chronologically sound and flags overlaps.
     */
    const validateChronology = (activities: IItineraryActivity[]): { valid: boolean; errorIndex: number | null; type: 'chronology' | 'overlap' | null } => {
        for (let i = 0; i < activities.length - 1; i++) {
            const current = activities[i];
            const next = activities[i + 1];

            const currentStart = parseTimeToMinutes(current.time || "09:00 AM");
            const currentEnd = currentStart + (current.duration_minutes || 60);
            const nextStart = parseTimeToMinutes(next.time || "10:00 AM");

            // Chronology Check: Next activity cannot start before current activity starts
            if (nextStart < currentStart) {
                return { valid: false, errorIndex: i + 1, type: 'chronology' };
            }

            // Overlap Check: Next activity starts before current activity ends
            if (nextStart < currentEnd) {
                return { valid: false, errorIndex: i + 1, type: 'overlap' };
            }
        }
        return { valid: true, errorIndex: null, type: null };
    };
    const { toast } = useToast();

    const queryClient = useQueryClient();

    // Sync state with props ONLY when trip ID changes or local state is empty
    // This prevents refetches from overwriting active UI transitions/mutations
    useEffect(() => {
        const hasLocalActivities = itinerary.some(d => d.activities?.length > 0);
        const hasIncomingActivities = trip.itinerary && trip.itinerary.length > 0 && trip.itinerary.some(d => d.activities?.length > 0);

        if (!trip.itinerary || trip.itinerary.length === 0) {
            // Only initialize empty if we don't have local data either
            if (!hasLocalActivities) {
                console.log('[ItineraryManager] DEBUG: Initializing empty itinerary');
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
        })
    );

    const moveActivity = (dayIndex: number, actIndex: number, direction: 'up' | 'down') => {
        const newItinerary = [...itinerary];
        const dayActivities = [...newItinerary[dayIndex].activities];

        const targetIndex = direction === 'up' ? actIndex - 1 : actIndex + 1;

        if (targetIndex >= 0 && targetIndex < dayActivities.length) {
            const moved = arrayMove(dayActivities, actIndex, targetIndex);

            // Validate Logic Phase
            const validation = validateChronology(moved);
            if (!validation.valid) {
                toast({
                    title: validation.type === 'chronology' ? "Chronological Error" : "Scheduling Conflict",
                    description: `Activity "${moved[validation.errorIndex!].title}" starts before the previous one ends.`,
                    variant: "destructive"
                });
            }
            newItinerary[dayIndex] = { ...newItinerary[dayIndex], activities: moved };
            setItinerary(newItinerary);
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
                    variant: "destructive"
                });
                setConflictError("This move creates a time overlap or chronological conflict.");
                return;
            }
            setConflictError(null);

            setItinerary(itinerary.map((d, idx) => idx === dayIndex ? { ...d, activities: newActivities } : d) as any);
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

    // Add Activity Mutation
    const addActivityMutation = useMutation({
        mutationFn: async ({ dayIndex, activity }: { dayIndex: number; activity: any }) => {
            const response = await apiRequest('POST', `/api/v1/trips/${trip.id}/itinerary/activities`, {
                dayIndex,
                activity
            });
            return response.json();
        },
        onSuccess: (data) => {
            setItinerary(data.itinerary);
            queryClient.invalidateQueries({ queryKey: ['/api/v1/trips', trip.id] });
            // Also update the query data immediately for faster UI
            queryClient.setQueryData(['/api/v1/trips', trip.id], (old: any) => old ? { ...old, itinerary: data.itinerary } : old);
            toast({ title: "Activity added", description: "Activity has been added to your itinerary." });
        },
        onError: () => {
            toast({ title: "Error", description: "Failed to add activity.", variant: "destructive" });
        }
    });

    // Update Activity Mutation
    const updateActivityMutation = useMutation({
        mutationFn: async ({ dayIndex, activityId, updates }: { dayIndex: number; activityId: string; updates: any }) => {
            const response = await apiRequest('PUT', `/api/v1/trips/${trip.id}/itinerary/activities/${activityId}`, {
                dayIndex,
                data: updates
            });
            return response.json();
        },
        onSuccess: (data) => {
            setItinerary(data.itinerary);
            queryClient.invalidateQueries({ queryKey: ['/api/v1/trips', trip.id] });
            queryClient.setQueryData(['/api/v1/trips', trip.id], (old: any) => old ? { ...old, itinerary: data.itinerary } : old);
            toast({ title: "Activity updated", description: "Activity has been updated." });
        },
        onError: () => {
            toast({ title: "Error", description: "Failed to update activity.", variant: "destructive" });
        }
    });

    // Delete Activity Mutation
    const deleteActivityMutation = useMutation({
        mutationFn: async ({ dayIndex, activityId }: { dayIndex: number; activityId: string }) => {
            const response = await apiRequest('DELETE', `/api/v1/trips/${trip.id}/itinerary/activities/${activityId}?dayIndex=${dayIndex}`);
            return response.json();
        },
        onSuccess: (data) => {
            setItinerary(data.itinerary);
            queryClient.invalidateQueries({ queryKey: ['/api/v1/trips', trip.id] });
            toast({ title: "Activity deleted", description: "Activity has been removed from your itinerary." });
        },
        onError: () => {
            toast({ title: "Error", description: "Failed to delete activity.", variant: "destructive" });
        }
    });

    const handleSaveActivity = (activity: any) => {
        if (!editingActivity) return;

        if (editingActivity.activity) {
            // Edit mode
            updateActivityMutation.mutate({
                dayIndex: editingActivity.dayIndex,
                activityId: editingActivity.activity.id,
                updates: activity
            });
        } else {
            // Add mode
            addActivityMutation.mutate({
                dayIndex: editingActivity.dayIndex,
                activity
            });
        }
    };

    const saveItinerary = async () => {
        setIsSaving(true);
        try {
            await apiRequest('PUT', `/api/v1/trips/${trip.id}/itinerary`, { itinerary });
            // Correct the mismatched string key to match the array key
            queryClient.invalidateQueries({ queryKey: ['/api/v1/trips', trip.id] });
            queryClient.setQueryData(['/api/v1/trips', trip.id], (old: any) => old ? { ...old, itinerary } : old);
        } catch (e) {
            console.error("Failed to save itinerary", e);
        } finally {
            setIsSaving(false);
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
        return <div className="text-ios-gray text-center pt-8 pb-8 bg-secondary/20 rounded-xl border border-dashed border-ios-gray/30">No itinerary generated yet.</div>;
    }

    const tripStartDate = (trip as any).startDate ? new Date((trip as any).startDate) : null;

    const getDayLabel = (dayIdx: number, day: IItineraryDay): string => {
        // Use the day's own date if present
        if (day.date) {
            const d = new Date(day.date);
            if (!isNaN(d.getTime())) {
                return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', weekday: 'short' });
            }
        }
        // Compute from trip startDate
        if (tripStartDate) {
            const d = new Date(tripStartDate);
            d.setDate(d.getDate() + dayIdx);
            return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', weekday: 'short' });
        }
        return '';
    };

    return (
        <div className="space-y-6">
            {itinerary.map((day, dayIdx) => {
                const dateLabel = getDayLabel(dayIdx, day);
            return (
                <div key={dayIdx} className="bg-[#1E1E1E] rounded-xl border border-white/5 mb-4 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-white/5 border-b border-white/5">
                        <div className="flex items-center gap-2">
                            <h3 className="font-bold text-white tracking-tight">Day {day.day || dayIdx + 1}</h3>
                            {dateLabel && (
                                <span className="text-xs text-[#06e0f9] bg-[#06e0f9]/10 px-2 py-0.5 rounded-full font-medium">{dateLabel}</span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400 bg-white/5 px-2 py-1 rounded-full">{day.activities.length} Activities</span>
                            <Button
                                onClick={() => handleAddActivity(dayIdx)}
                                size="sm"
                                className="bg-[#06e0f9] hover:bg-[#06e0f9]/90 text-gray-900 flex items-center gap-1 rounded-lg text-xs font-medium"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Add Activity</span>
                            </Button>
                        </div>
                    </div>

                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, dayIdx)}>
                        <SortableContext items={day.activities.map(a => a.id)} strategy={verticalListSortingStrategy}>
                            <div className="flex flex-col">
                                {day.activities.map((activity, actIdx) => (
                                    <SortableActivity
                                        key={activity.id || `temp-${actIdx}`}
                                        activity={activity}
                                        index={actIdx}
                                        total={day.activities.length}
                                        onEdit={() => handleEditActivity(dayIdx, actIdx)}
                                        onDelete={() => handleDeleteActivity(dayIdx, actIdx)}
                                        onMove={(dir) => moveActivity(dayIdx, actIdx, dir)}
                                        tripId={String(trip.id)}
                                        dayIndex={dayIdx}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>

                    {conflictError && (
                        <p className="mx-4 mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400 flex items-center gap-2 mt-4" role="alert" aria-live="assertive">
                            ⚠️ {conflictError}
                        </p>
                    )}

                    <div className="mt-4">
                        {/* Atlas Day Optimization + AI Metadata */}
                        <AtlasDayButton
                            dayIndex={dayIdx}
                            destination={trip.destination}
                            activities={(day.activities || []).map(a => ({
                                id: String(a.id),
                                time: a.time || '',
                                placeName: a.title || a.placeName || '',
                                location: a.location || '',
                                type: a.type || 'activity',
                                lat: ('lat' in a ? Number(a.lat) : 0),
                                lon: ('lon' in (a as any) ? Number((a as any).lon) : 0),
                            })) as any[]}
                            tripId={String(trip.id)}
                        />
                        {(day.confidenceScore || day.reasoning) && (
                            <div className="px-4 pb-4 flex flex-col gap-2">
                                {day.confidenceScore && (
                                    <div className="flex items-center gap-2">
                                        <ModelConfidenceBadge
                                            confidence={day.confidenceScore === 'high' ? 'High' : day.confidenceScore === 'medium' ? 'Medium' : 'Low'}
                                        />
                                    </div>
                                )}
                                {day.reasoning && (
                                    <AIReasoningPanel
                                        reasoning={day.reasoning}
                                        dayIndex={dayIdx}
                                        confidence={day.confidenceScore === 'high' ? 'High' : day.confidenceScore === 'medium' ? 'Medium' : 'Low'}
                                    />
                                )}
                            </div>
                        )}
                    </div>
                </div>
            ); })}

            <ActivityFormDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                activity={editingActivity?.activity}
                dayIndex={editingActivity?.dayIndex || 0}
                onSave={handleSaveActivity}
            />
        </div>
    );
}
