// Expense Handler — lets Atlas add or remove trip expenses. Removal is
// destructive and gated by the confirm-required check in executor.ts.

import type { ToolResult } from '../../types';
import { TripModel } from '@shared/schema';
import { nanoid } from 'nanoid';
import { socketService } from '../../../services/SocketService';

export async function expenseToolHandler(
    args: {
        userId: string;
        tripId: string;
        action: 'add' | 'remove';
        amount?: number;
        currency?: string;
        category?: string;
        description?: string;
        expenseId?: string;
    },
): Promise<ToolResult> {
    const start = Date.now();
    try {
        const userId = (args.userId || '').trim();
        const tripId = (args.tripId || '').trim();
        if (!userId || !tripId) {
            return { success: false, error: 'tripId and userId are required', durationMs: Date.now() - start };
        }

        const trip = await TripModel.findOne({
            _id: tripId,
            $or: [{ userId }, { collaborators: { $elemMatch: { userId, role: 'editor' } } }],
        });
        if (!trip) {
            return { success: false, error: 'Trip not found', durationMs: Date.now() - start };
        }

        if (args.action === 'add') {
            if (!args.amount || !args.currency || !args.category) {
                return { success: false, error: 'amount, currency, and category are required to add an expense', durationMs: Date.now() - start };
            }
            const newExpense = {
                id: nanoid(),
                amount: args.amount,
                currency: args.currency,
                category: args.category,
                description: args.description || '',
                date: new Date(),
            };
            if (!trip.expenses) trip.expenses = [];
            trip.expenses.push(newExpense as any);
            await trip.save();
            socketService.broadcastMutation(tripId, { type: 'expenses-updated', data: trip.expenses }, userId);
            return {
                success: true,
                data: { message: `Added ${args.amount} ${args.currency} expense (${args.category}).`, expense: newExpense },
                durationMs: Date.now() - start,
            };
        }

        if (args.action === 'remove') {
            if (!args.expenseId) {
                return { success: false, error: 'expenseId is required to remove an expense', durationMs: Date.now() - start };
            }
            const before = trip.expenses?.length || 0;
            trip.expenses = (trip.expenses || []).filter((e: any) => e.id !== args.expenseId);
            if (trip.expenses.length === before) {
                return { success: false, error: 'Expense not found', durationMs: Date.now() - start };
            }
            await trip.save();
            socketService.broadcastMutation(tripId, { type: 'expenses-updated', data: trip.expenses }, userId);
            return { success: true, data: { message: 'Expense removed.' }, durationMs: Date.now() - start };
        }

        return { success: false, error: `Unknown action: ${args.action}`, durationMs: Date.now() - start };
    } catch (err: any) {
        return { success: false, error: err.message || 'Expense operation failed', durationMs: Date.now() - start };
    }
}
