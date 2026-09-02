import { z } from "zod";

// This only re-declared the handful of fields the very first version of
// trip creation had. Every field the client has added since (AI-generated
// itinerary, notes, cost breakdown, transport mode, cuisine/dietary prefs)
// was never added here — validate() replaces req.body wholesale with a
// schema's parsed output (see middleware/validate.ts), so all of those were
// silently stripped to undefined on every real trip creation, no error,
// no trace. A user planning a trip via TripPlanner would generate a full
// AI itinerary, hit Save, and land on a trip with zero activities.
// insertTripSchema (shared/schema.ts) already re-validates the full shape
// inside createTrip itself, so this only needs to stop dropping the fields
// before they get there — kept as its own object rather than importing
// insertTripSchema directly since this one omits server-only fields like
// userId/shareId that a client must never set.
export const createTripSchema = z.object({
  body: z.object({
    origin: z.string().optional(),
    destination: z.string().min(1, "Destination is required"),
    days: z.coerce.number().int().min(1, "Days must be at least 1"),
    groupSize: z.coerce.number().int().min(1, "Group size must be at least 1"),
    travelStyle: z
      .enum([
        "budget",
        "standard",
        "luxury",
        "adventure",
        "relaxed",
        "family",
        "cultural",
        "culinary",
      ])
      .default("standard"),
    transportMode: z.string().optional(),
    budget: z.coerce.number().min(0).optional(),
    currency: z.string().default("INR"),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    isInternational: z.coerce.boolean().optional(),
    status: z.enum(["planning", "active", "completed"]).optional(),
    notes: z.string().optional(),
    cuisinePreferences: z.array(z.string()).optional(),
    dietaryPreferences: z.array(z.string()).optional(),
    costBreakdown: z.record(z.any()).optional(),
    itinerary: z
      .array(
        z.object({
          dayIndex: z.number().int().min(0).optional(),
          day: z.number().int().min(1).optional(),
          date: z.coerce.date().optional(),
          activities: z
            .array(
              z
                .object({
                  id: z.string().optional(),
                  time: z.string().optional(),
                  title: z.string().min(1),
                  location: z.string().optional(),
                  address: z.string().optional(),
                  lat: z.number().optional(),
                  lon: z.number().optional(),
                  notes: z.string().optional(),
                })
                .catchall(z.any()),
            )
            .default([]),
          reasoning: z.string().optional(),
          confidenceScore: z.enum(["high", "medium", "low"]).optional(),
        }),
      )
      .optional(),
  }),
});

export const updateTripSchema = z.object({
  params: z.object({
    id: z.string().min(1, "Trip ID is required"),
  }),
  body: z
    .object({
      destination: z.string().optional(),
      days: z.coerce.number().int().min(1).optional(),
      groupSize: z.coerce.number().int().min(1).optional(),
      travelStyle: z.string().optional(),
      status: z.enum(["planning", "active", "completed"]).optional(),
      budget: z.coerce.number().min(0).optional(),
      startDate: z.coerce.date().optional(),
      endDate: z.coerce.date().optional(),
      notes: z.string().optional(),
    })
    .partial(),
});

export const discoverPlacesSchema = z.object({
  body: z.object({
    destination: z.string().min(1, "Destination is required"),
    category: z.string().optional(),
    coordinates: z
      .object({
        lat: z.number(),
        lng: z.number(),
      })
      .optional(),
  }),
});

const TravelStyleEnum = z.enum(["Luxury", "Adventure", "Budget", "Relaxed", "Cultural", "Family"]);
const TravelMediumEnum = z.enum(["Flight", "Train", "RoadTrip"]);

export const generateTripSchema = z.object({
  body: z.object({
    destination: z.string().min(1, "Destination is required"),
    startDate: z.string().min(1, "Start date is required"),
    endDate: z.string().min(1, "End date is required"),
    totalBudget: z.number().positive("Budget must be positive"),
    currency: z.string().default("USD"),
    travelStyle: TravelStyleEnum,
    travelMedium: TravelMediumEnum,
    companions: z.number().int().positive("Companions must be at least 1"),
    interests: z.array(z.string()).optional(),
  }),
});
