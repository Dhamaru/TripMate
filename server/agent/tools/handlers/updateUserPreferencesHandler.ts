// Update User Preferences Handler — saves profile updates from Atlas

import type { ToolResult } from '../../types';
import { UserModel } from '@shared/schema';

export async function updateUserPreferencesHandler(args: { 
    userId: string;
    homeCity?: string;
    dietaryPreferences?: string[];
    preferredTransport?: string;
    interests?: string[];
    name?: string;
}): Promise<ToolResult> {
    const start = Date.now();
    try {
        const userId = (args.userId || '').trim();
        if (!userId) {
            return { success: false, error: 'userId is required', durationMs: Date.now() - start };
        }

        const updateData: any = {};
        if (args.homeCity !== undefined) updateData.homeCity = args.homeCity;
        if (args.dietaryPreferences !== undefined) updateData.dietaryPreferences = args.dietaryPreferences;
        if (args.preferredTransport !== undefined) updateData.preferredTransport = args.preferredTransport;
        if (args.interests !== undefined) updateData.interests = args.interests;
        
        if (args.name) {
            const parts = args.name.trim().split(' ');
            if (parts.length > 0) updateData.firstName = parts[0];
            if (parts.length > 1) updateData.lastName = parts.slice(1).join(' ');
        }

        const user = await UserModel.findByIdAndUpdate(userId, { $set: updateData }, { new: true }).lean().exec();
        if (!user) {
            return { success: false, error: 'User not found', durationMs: Date.now() - start };
        }

        return {
            success: true,
            data: {
                message: 'Preferences updated successfully',
                updatedFields: Object.keys(updateData)
            },
            durationMs: Date.now() - start,
        };
    } catch (err: any) {
        return { success: false, error: err.message || 'Failed to update preferences', durationMs: Date.now() - start };
    }
}
