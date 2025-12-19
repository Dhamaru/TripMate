import { useState } from "react";
import { type Trip, type IItineraryDay, type IItineraryActivity } from "@shared/schema";
import { DndContext, closestCenter, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GripVertical, Clock, MapPin, Edit2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ItineraryManagerProps {
    trip: Trip;
}

// Sortable Item Component
function SortableActivity({ activity, index, onEdit }: { activity: IItineraryActivity; index: number; onEdit: () => void }) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: activity.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div ref={setNodeRef} style={style} className="bg-secondary p-3 rounded-lg mb-2 flex items-start gap-3 group">
            <div {...attributes} {...listeners} className="mt-1 cursor-grab text-ios-gray hover:text-white">
                <GripVertical className="w-5 h-5" />
            </div>
            <div className="flex-1">
                <div className="flex justify-between items-start">
                    <h4 className="font-medium text-white">{activity.title}</h4>
                    <Button onClick={onEdit} variant="ghost" size="icon" className="h-6 w-6 text-ios-gray hover:text-white opacity-0 group-hover:opacity-100">
                        <Edit2 className="w-3 h-3" />
                    </Button>
                </div>
                <div className="flex flex-wrap gap-3 mt-1 text-xs text-ios-gray">
                    {activity.time && (
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {activity.time}</span>
                    )}
                    {activity.location && (
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {activity.location}</span>
                    )}
                </div>
                {activity.notes && <p className="text-xs text-ios-gray mt-1 italic">{activity.notes}</p>}
            </div>
        </div>
    );
}

export function ItineraryManager({ trip }: ItineraryManagerProps) {
    const [itinerary, setItinerary] = useState<IItineraryDay[]>(trip.itinerary || []);
    const [isSaving, setIsSaving] = useState(false);

    // DnD Sensors
    const sensors = useSensors(
        useSensor(MouseSensor), // Instant drag for mouse
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
            // Construct a new plan where we immediately sync to server or offer a save button
        }
    };

    const handleEditActivity = (dayIndex: number, actIndex: number) => {
        const activity = itinerary[dayIndex].activities[actIndex];
        const newTitle = prompt("Edit activity:", activity.title); // Simple prompt for now
        if (newTitle && newTitle !== activity.title) {
            const newItinerary = [...itinerary];
            newItinerary[dayIndex].activities[actIndex] = { ...activity, title: newTitle };
            setItinerary(newItinerary);
        }
    };

    const saveItinerary = async () => {
        setIsSaving(true);
        try {
            await apiRequest('PUT', `/api/v1/trips/${trip._id}/itinerary`, { itinerary });
            queryClient.invalidateQueries({ queryKey: [`/api/v1/trips/${trip._id}`] });
        } catch (e) {
            console.error("Failed to save itinerary", e);
        } finally {
            setIsSaving(false);
        }
    };

    if (!itinerary || itinerary.length === 0) return <div className="text-ios-gray text-center">No itinerary generated yet.</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <Button onClick={saveItinerary} disabled={isSaving} className="bg-ios-blue text-white">
                    {isSaving ? "Saving..." : "Save Order"}
                </Button>
            </div>
            {itinerary.map((day, dayIdx) => (
                <Card key={dayIdx} className="bg-card border-border">
                    <CardContent className="pt-6">
                        <h3 className="font-bold text-lg text-white mb-4">Day {day.day || dayIdx + 1}</h3>

                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, dayIdx)}>
                            <SortableContext items={day.activities.map(a => a.id)} strategy={verticalListSortingStrategy}>
                                {day.activities.map((activity, actIdx) => (
                                    // Ensure ID exists, if not use index (fallback, though schema should enforce ID)
                                    <SortableActivity key={activity.id || `temp-${actIdx}`} activity={activity} index={actIdx} onEdit={() => handleEditActivity(dayIdx, actIdx)} />
                                ))}
                            </SortableContext>
                        </DndContext>

                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
