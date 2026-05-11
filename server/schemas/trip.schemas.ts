import { z } from "zod";

export const createTripSchema = z.object({
    body: z.object({
        destination: z.string().min(1, "Destination is required"),
        days: z.coerce.number().int().min(1, "Days must be at least 1"),
        groupSize: z.coerce.number().int().min(1, "Group size must be at least 1"),
        travelStyle: z.enum([
            "budget",
            "standard",
            "luxury",
            "adventure",
            "relaxed",
            "family",
            "cultural",
            "culinary",
        ]).default("standard"),
        budget: z.coerce.number().min(0).optional(),
        currency: z.string().default("INR"),
        startDate: z.coerce.date().optional(),
        isInternational: z.coerce.boolean().optional(),
    }),
});

export const updateTripSchema = z.object({
    params: z.object({
        id: z.string().min(1, "Trip ID is required"),
    }),
    body: z.object({
        destination: z.string().optional(),
        days: z.coerce.number().int().min(1).optional(),
        groupSize: z.coerce.number().int().min(1).optional(),
        travelStyle: z.string().optional(),
        status: z.enum(["planning", "active", "completed"]).optional(),
        budget: z.coerce.number().min(0).optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        notes: z.string().optional(),
    }).partial(),
});

export const discoverPlacesSchema = z.object({
    body: z.object({
        destination: z.string().min(1, "Destination is required"),
        category: z.string().optional(),
        coordinates: z.object({
            lat: z.number(),
            lng: z.number(),
        }).optional(),
    }),
});

const TravelStyleEnum = z.enum(['Luxury', 'Adventure', 'Budget', 'Relaxed', 'Cultural', 'Family'])
const TravelMediumEnum = z.enum(['Flight', 'Train', 'RoadTrip'])

export const generateTripSchema = z.object({
    body: z.object({
        destination: z.string().min(1, "Destination is required"),
        startDate: z.string().min(1, "Start date is required"),
        endDate: z.string().min(1, "End date is required"),
        totalBudget: z.number().positive("Budget must be positive"),
        currency: z.string().default('USD'),
        travelStyle: TravelStyleEnum,
        travelMedium: TravelMediumEnum,
        companions: z.number().int().positive("Companions must be at least 1"),
        interests: z.array(z.string()).optional(),
    }),
});
