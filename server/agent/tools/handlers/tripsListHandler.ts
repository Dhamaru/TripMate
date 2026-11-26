// Trips List Handler — enumerates a user's trips so Atlas can answer
// "what are my trips" without an already-open tripId in context.

import type { ToolResult } from '../../types';
import { TripModel } from '@shared/schema';

export async function tripsListHandler(
    args: { userId: string },
): Promise<ToolResult> {
    const start = Date.now();
    try {
        const userId = (args.userId || '').trim();
        if (!userId) {
            return { success: false, error: 'userId is required', durationMs: Date.now() - start };
        }

        const docs = await TripModel.find({ userId })
            .select('destination startDate endDate status days budget currency')
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();

        return {
            success: true,
            data: {
                trips: docs.map((d: any) => ({
                    id: d._id,
                    destination: d.destination,
                    startDate: d.startDate,
                    endDate: d.endDate,
                    status: d.status,
                    days: d.days,
                    budget: d.budget,
                    currency: d.currency || 'INR',
                })),
                count: docs.length,
            },
            durationMs: Date.now() - start,
        };
    } catch (err: any) {
        return { success: false, error: err.message || 'Failed to list trips', durationMs: Date.now() - start };
    }
}
