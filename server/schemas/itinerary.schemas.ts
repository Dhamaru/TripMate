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
    data: z
      .object({
        time: z.string().optional(),
        title: z.string().optional(),
        location: z.string().optional(),
        notes: z.string().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
      })
      .partial(),
  }),
});

// Structurally required fields only — .passthrough() on both levels because
// IItineraryActivity is deliberately open-ended (AI-generated fields like
// address/lat/lon/type vary per activity, shared/schema.ts's model has a
// `[key: string]: any` index signature for the same reason). This still
// rejects payloads that aren't well-formed day/activity arrays (the actual
// injection surface z.any() left open), without breaking legitimate extra
// fields the rest of the app already relies on.
const reorderActivitySchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
  })
  .passthrough();

const reorderDaySchema = z
  .object({
    dayIndex: z.coerce.number().int().min(0),
    activities: z.array(reorderActivitySchema),
  })
  .passthrough();

export const reorderItinerarySchema = z.object({
  params: z.object({
    id: z.string().min(1, "Trip ID is required"),
  }),
  body: z.object({
    itinerary: z.array(reorderDaySchema),
  }),
});
