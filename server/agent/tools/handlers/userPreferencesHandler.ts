// User Preferences Handler — queries User model + last 5 trips

import type { ToolResult } from '../../types';
import { UserModel, TripModel } from '@shared/schema';

export async function userPreferencesHandler(args: { userId: string }): Promise<ToolResult> {
    const start = Date.now();
    try {
        const userId = (args.userId || '').trim();
        if (!userId) {
            return { success: false, error: 'userId is required', durationMs: Date.now() - start };
        }

        // Fetch user profile
        const user = await UserModel.findById(userId).lean().exec();
        if (!user) {
            return { success: false, error: 'User not found', durationMs: Date.now() - start };
        }

        // Fetch last 5 trip destinations
        const recentTrips = await TripModel.find({ userId })
            .sort({ createdAt: -1 })
            .limit(5)
            .select('destination travelStyle days budget currency status createdAt')
            .lean()
            .exec();

        const lastDestinations = recentTrips.map((t: any) => ({
            destination: t.destination,
            travelStyle: t.travelStyle,
            days: t.days,
            budget: t.budget,
            currency: t.currency,
            status: t.status,
        }));

        // Derive preferred travel style from most common
        const styleCounts: Record<string, number> = {};
        for (const trip of recentTrips) {
            const style = (trip as any).travelStyle || 'standard';
            styleCounts[style] = (styleCounts[style] || 0) + 1;
        }
        const preferredStyle = Object.entries(styleCounts).sort(([, a], [, b]) => b - a)[0]?.[0] || 'standard';

        return {
            success: true,
            data: {
                name: [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Traveler',
                email: user.email || '',
                homeCity: user.homeCity,
                dietaryPreferences: user.dietaryPreferences,
                preferredTransport: user.preferredTransport,
                interests: user.interests,
                totalTrips: recentTrips.length,
                lastDestinations,
                preferredStyle,
            },
            durationMs: Date.now() - start,
        };
    } catch (err: any) {
        return { success: false, error: err.message || 'Failed to fetch preferences', durationMs: Date.now() - start };
    }
}
