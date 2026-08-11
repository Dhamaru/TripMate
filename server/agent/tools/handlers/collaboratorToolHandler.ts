// Collaborator Handler — lets Atlas add or remove a trip collaborator by
// email. Both directions mutate access control, so both are gated by the
// confirm-required check in executor.ts, not just removal.

import type { ToolResult } from '../../types';
import { TripModel, UserModel } from '@shared/schema';
import { socketService } from '../../../services/SocketService';

export async function collaboratorToolHandler(
    args: {
        userId: string;
        tripId: string;
        action: 'add' | 'remove';
        email?: string;
        role?: 'editor' | 'viewer';
        collaboratorId?: string;
    },
): Promise<ToolResult> {
    const start = Date.now();
    try {
        const userId = (args.userId || '').trim();
        const tripId = (args.tripId || '').trim();
        if (!userId || !tripId) {
            return { success: false, error: 'tripId and userId are required', durationMs: Date.now() - start };
        }

        // Only the primary owner can manage collaborators — matches the REST route.
        const trip = await TripModel.findOne({ _id: tripId, userId });
        if (!trip) {
            return { success: false, error: 'Trip not found or you are not the owner', durationMs: Date.now() - start };
        }

        if (args.action === 'add') {
            if (!args.email) {
                return { success: false, error: 'email is required to add a collaborator', durationMs: Date.now() - start };
            }
            const userToAdd = await UserModel.findOne({ email: args.email.toLowerCase() });
            if (!userToAdd) {
                return { success: false, error: `No TripMate user found with email ${args.email}`, durationMs: Date.now() - start };
            }
            const userToAddId = (userToAdd as any)._id.toString();
            if (userToAddId === userId) {
                return { success: false, error: 'You are already the owner of this trip', durationMs: Date.now() - start };
            }
            const already = trip.collaborators?.some((c: any) => c.userId === userToAddId);
            if (already) {
                return { success: false, error: 'That person is already a collaborator', durationMs: Date.now() - start };
            }
            const updated = await TripModel.findByIdAndUpdate(
                tripId,
                { $push: { collaborators: { userId: userToAddId, role: args.role || 'editor', joinedAt: new Date() } } },
                { new: true },
            );
            socketService.broadcastMutation(tripId, { type: 'collaborators-updated', data: updated }, userId);
            return {
                success: true,
                data: { message: `Added ${args.email} as a${args.role === 'viewer' ? ' viewer' : 'n editor'}.` },
                durationMs: Date.now() - start,
            };
        }

        if (args.action === 'remove') {
            if (!args.collaboratorId) {
                return { success: false, error: 'collaboratorId is required to remove a collaborator', durationMs: Date.now() - start };
            }
            const updated = await TripModel.findByIdAndUpdate(
                tripId,
                { $pull: { collaborators: { userId: args.collaboratorId } } },
                { new: true },
            );
            socketService.broadcastMutation(tripId, { type: 'collaborators-updated', data: updated }, userId);
            return { success: true, data: { message: 'Collaborator removed.' }, durationMs: Date.now() - start };
        }

        return { success: false, error: `Unknown action: ${args.action}`, durationMs: Date.now() - start };
    } catch (err: any) {
        return { success: false, error: err.message || 'Collaborator operation failed', durationMs: Date.now() - start };
    }
}
