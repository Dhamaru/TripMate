import { z } from "zod";

export const addActivitySchema = z.object({
    params: z.object({
        id: z.string().min(1, "Trip ID is required"),
    }),
    body: z.object({
        dayIndex: z.coerce.number().int().min(0),
        activity: z.object({
            time: z.string().optional(),
            title: z.string().min(1, "Title is required"),
            location: z.string().optional(),
            notes: z.string().optional(),
            latitude: z.number().optional(),
            longitude: z.number().optional(),
        }),
    }),
});

export const updateActivitySchema = z.object({
    params: z.object({
        id: z.string().min(1, "Trip ID is required"),
        activityId: z.string().min(1, "Activity ID is required"),
    }),
    body: z.object({
        dayIndex: z.coerce.number().int().min(0),
        data: z.object({
            time: z.string().optional(),
            title: z.string().optional(),
            location: z.string().optional(),
            notes: z.string().optional(),
            latitude: z.number().optional(),
            longitude: z.number().optional(),
        }).partial(),
    }),
});

export const reorderItinerarySchema = z.object({
    params: z.object({
        id: z.string().min(1, "Trip ID is required"),
    }),
    body: z.object({
        itinerary: z.array(z.any()), // Complex structure validated in controller or deeper schema
    }),
});
