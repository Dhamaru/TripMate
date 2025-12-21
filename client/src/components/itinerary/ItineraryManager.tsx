import { useState, useEffect } from "react";
import { type Trip, type IItineraryDay, type IItineraryActivity } from "@shared/schema";
import { DndContext, closestCenter, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GripVertical, Clock, MapPin, Edit2, ChevronUp, ChevronDown, Trash2, Plus } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ActivityFormDialog } from "./ActivityFormDialog";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

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
    onMove
}: {
    activity: IItineraryActivity;
    index: number;
    total: number;
    onEdit: () => void;
    onDelete: () => void;
    onMove: (direction: 'up' | 'down') => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: activity.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div ref={setNodeRef} style={style} className="bg-secondary/50 border border-ios-gray/20 p-3 rounded-lg mb-2 flex items-start gap-3 group relative">
            <div {...attributes} {...listeners} className="mt-1 cursor-grab text-ios-gray hover:text-white flex-shrink-0">
                <GripVertical className="w-5 h-5" />
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start gap-2">
                    <h4 className="font-medium text-white truncate">{activity.title}</h4>
                    <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <Button
                            onClick={() => onMove('up')}
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-ios-gray hover:text-ios-blue disabled:opacity-30"
                            disabled={index === 0}
                            title="Move Up"
                        >
                            <ChevronUp className="w-4 h-4" />
                        </Button>
                        <Button
                            onClick={() => onMove('down')}
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-ios-gray hover:text-ios-blue disabled:opacity-30"
                            disabled={index === total - 1}
                            title="Move Down"
                        >
                            <ChevronDown className="w-4 h-4" />
                        </Button>
                        <Button onClick={onEdit} variant="ghost" size="icon" className="h-7 w-7 text-ios-gray hover:text-white" title="Edit">
                            <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button onClick={onDelete} variant="ghost" size="icon" className="h-7 w-7 text-ios-gray hover:text-red-500" title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                    </div>
                </div>
                <div className="flex flex-wrap gap-3 mt-1 text-xs text-ios-gray">
                    {activity.time && (
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {activity.time}</span>
                    )}
                    {activity.location && (
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {activity.location}</span>
                    )}
                </div>
                {activity.notes && <p className="text-xs text-ios-gray mt-1 italic line-clamp-2">{activity.notes}</p>}
            </div>
        </div>
    );
}

export function ItineraryManager({ trip }: ItineraryManagerProps) {
    const [itinerary, setItinerary] = useState<IItineraryDay[]>(trip.itinerary || []);
    const [isSaving, setIsSaving] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingActivity, setEditingActivity] = useState<{ dayIndex: number; activity: any } | null>(null);
    const { toast } = useToast();

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

            const newItinerary = [...itinerary];
            newItinerary[dayIndex] = { ...newItinerary[dayIndex], activities: newActivities };

            setItinerary(newItinerary);
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
            queryClient.invalidateQueries({ queryKey: [`/api/v1/trips/${trip.id}`] });
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
                updates
            });
            return response.json();
        },
        onSuccess: (data) => {
            setItinerary(data.itinerary);
            queryClient.invalidateQueries({ queryKey: [`/api/v1/trips/${trip.id}`] });
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
            queryClient.invalidateQueries({ queryKey: [`/api/v1/trips/${trip.id}`] });
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
            queryClient.invalidateQueries({ queryKey: [`/api/v1/trips/${trip.id}`] });
        } catch (e) {
            console.error("Failed to save itinerary", e);
        } finally {
            setIsSaving(false);
        }
    };

    if (!itinerary || itinerary.length === 0) return <div className="text-ios-gray text-center pt-8 pb-8 bg-secondary/20 rounded-xl border border-dashed border-ios-gray/30">No itinerary generated yet.</div>;

    return (
        <div className="space-y-6">
            {itinerary.map((day, dayIdx) => (
                <Card key={dayIdx} className="bg-ios-card/50 border-ios-gray/20 backdrop-blur-sm">
                    <CardContent className="pt-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-xl text-white">Day {day.day || dayIdx + 1}</h3>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-ios-gray bg-ios-gray/10 px-2 py-1 rounded-full">{day.activities.length} Activities</span>
                                <Button
                                    onClick={() => handleAddActivity(dayIdx)}
                                    size="sm"
                                    className="bg-ios-blue hover:bg-blue-600 text-white flex items-center gap-1"
                                >
                                    <Plus className="w-4 h-4" />
                                    Add Activity
                                </Button>
                            </div>
                        </div>

                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, dayIdx)}>
                            <SortableContext items={day.activities.map(a => a.id)} strategy={verticalListSortingStrategy}>
                                <div className="space-y-3">
                                    {day.activities.map((activity, actIdx) => (
                                        <SortableActivity
                                            key={activity.id || `temp-${actIdx}`}
                                            activity={activity}
                                            index={actIdx}
                                            total={day.activities.length}
                                            onEdit={() => handleEditActivity(dayIdx, actIdx)}
                                            onDelete={() => handleDeleteActivity(dayIdx, actIdx)}
                                            onMove={(dir) => moveActivity(dayIdx, actIdx, dir)}
                                        />
                                    ))}
                                </div>
                            </SortableContext>
                        </DndContext>
                    </CardContent>
                </Card>
            ))}

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
