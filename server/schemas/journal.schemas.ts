import { z } from "zod";

export const createJournalEntrySchema = z.object({
    body: z.object({
        tripId: z.string().optional(),
        title: z.string().min(1, "Title is required"),
        content: z.string().min(1, "Content is required"),
        location: z.string().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        dayIndex: z.number().int().min(0).optional(),
        photos: z.array(z.string()).optional(),
    }),
});

export const updateJournalEntrySchema = z.object({
    params: z.object({
        id: z.string().min(1, "Journal Entry ID is required"),
    }),
    body: z.object({
        title: z.string().optional(),
        content: z.string().optional(),
        location: z.string().optional(),
        photos: z.array(z.string()).optional(),
    }).partial(),
});
