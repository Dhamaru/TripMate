// Trip Planner Handler — Full Itinerary Finalization (Task 33)

import type { ToolResult } from '../../types';
import { TripModel } from '@shared/schema';

export async function tripPlannerHandler(
    args: { tripId: string; userId: string; itinerary: any[] },
): Promise<ToolResult> {
    const start = Date.now();
    try {
        const { tripId, userId, itinerary } = args;

        if (!tripId || !userId || !itinerary) {
            return { success: false, error: 'tripId, userId, and itinerary are required', durationMs: Date.now() - start };
        }

        const doc = await TripModel.findOne({ _id: tripId, userId });
        if (!doc) {
            return { success: false, error: 'Trip not found', durationMs: Date.now() - start };
        }

        // Validate and clean itinerary structure for Mongoose
        const cleanedItinerary = itinerary.map((day: any, dIdx: number) => ({
            dayIndex: day.dayIndex ?? dIdx, // Ensure 0-based index
            day: day.day || dIdx + 1,
            activities: (day.activities || []).map((act: any, aIdx: number) => ({
                id: act.id || Math.random().toString(36).substring(7),
                time: act.time || `${String(8 + aIdx).padStart(2, '0')}:00 AM`,
                title: act.title || 'Activity',
                location: act.location || '',
                notes: act.notes || '',
                latitude: act.latitude,
                longitude: act.longitude,
            })),
        }));

        doc.itinerary = cleanedItinerary;
        doc.status = 'planning';
        doc.markModified('itinerary');

        await doc.save();

        return {
            success: true,
            data: {
                message: 'Trip itinerary finalized and saved successfully.',
                tripId,
                daysCount: cleanedItinerary.length,
            },
            durationMs: Date.now() - start,
        };
    } catch (err: any) {
        return { success: false, error: err.message || 'Trip finalization failed', durationMs: Date.now() - start };
    }
}
