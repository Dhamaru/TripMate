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
        z
          .object({
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
          })
          // "Import My Plan" adds day-level fields beyond this list
          // (departureReminder, dayBudget, weatherNote, location,
          // wakeUpTime, headlineExperience) — same reasoning as the
          // activities catchall just above: an unlisted field is silently
          // stripped by validate() otherwise, and this object grows every
          // time a new per-day enrichment field is added.
          .catchall(z.any()),
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

// "Import My Plan" (parse-schedule) — was validated client-side only
// (10-char minimum, a truthy groupSize check), so a malformed request
// still reached the AI call: no server-side floor, no location sanity
// check, no rejection of a start date already in the past. Every check
// here runs BEFORE the AI call — a request that fails any of them never
// reaches AiUtilitiesService.parseSchedule, so it never spends the model
// budget on input that was always going to fail.
export const parseScheduleSchema = z.object({
  body: z
    .object({
      // Bare .min()/.max() intentionally, not chained with the location
      // check below — superRefine short-circuits so a too-short input
      // reports ONLY the length error, not both stacked together (a
      // 5-char input used to fail length AND the location regex at once,
      // producing two concatenated messages in one string; the client-side
      // mirror in TripPlanner.tsx already checks these as if/else-if,
      // this brings the server in line with it).
      scheduleText: z
        .string()
        .min(20, "Tell us a bit more about your trip — at least 20 characters.")
        .max(3000, "That's a lot of text — please keep it under 3000 characters."),
      startDate: z.coerce
        .date()
        .optional()
        .refine((d) => !d || d.getTime() >= Date.now() - 24 * 60 * 60 * 1000, {
          message: "Start date can't be in the past.",
        }),
      groupSize: z.coerce.number().int().min(1, "Group size must be at least 1."),
      budget: z.coerce.number().min(0).optional(),
      currency: z.string().max(3).optional(),
    })
    .superRefine((data, ctx) => {
      if (data.scheduleText.length < 20) return; // .min() above already reports this
      // A real schedule reads out place names, which are near-universally
      // capitalized in English text ("Goa", "Baga Beach", "Fort Aguada").
      // Deliberately loose — this only needs to catch clearly-empty or
      // gibberish input ("asdf asdf asdf"), not verify the location is
      // real; AiUtilitiesService.parseSchedule and its downstream
      // grounding pass are what actually verify real places.
      if (!/[A-Z][a-zA-Z]{2,}/.test(data.scheduleText)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "We couldn't find a place name in your schedule — try including city or location names.",
          path: ["scheduleText"],
        });
      }
    }),
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
