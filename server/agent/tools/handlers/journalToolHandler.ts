// Journal Entry Handler — lets Atlas actually create a journal entry from
// conversation, not just augment text the user already wrote.

import type { ToolResult } from '../../types';
import { JournalEntryModel } from '@shared/schema';

export async function journalToolHandler(
    args: {
        userId: string;
        tripId?: string;
        title: string;
        content: string;
        dayIndex?: number;
        location?: string;
    },
): Promise<ToolResult> {
    const start = Date.now();
    try {
        const userId = (args.userId || '').trim();
        if (!userId) {
            return { success: false, error: 'userId is required', durationMs: Date.now() - start };
        }
        if (!args.title || !args.content) {
            return { success: false, error: 'title and content are required', durationMs: Date.now() - start };
        }

        const entry = await JournalEntryModel.create({
            userId,
            tripId: args.tripId,
            title: args.title,
            content: args.content,
            dayIndex: args.dayIndex,
            location: args.location,
        });

        return {
            success: true,
            data: { message: `Saved journal entry "${args.title}".`, id: entry._id },
            durationMs: Date.now() - start,
        };
    } catch (err: any) {
        return { success: false, error: err.message || 'Failed to save journal entry', durationMs: Date.now() - start };
    }
}
