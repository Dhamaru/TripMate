import { z } from "zod";

// `lat`/`lon` (not `latitude`/`longitude`) to match IItineraryActivity in
// shared/schema.ts, TripMap.tsx's marker-placement code, and every
// AI-generated activity — those were the only fields this schema had for
// coordinates until now. ActivityFormDialog.tsx sends the full field set
// below (time/title/placeName/address/type/cost/entryFee/duration_minutes/
// lat/lon/from/to/notes) on every add and edit; since validate.ts strips
// unknown body keys (a real, separate fix — see CONTEXT.md), every one of
// those not already listed here was being silently discarded on every
// manually-added or manually-edited activity: no coordinates -> no map
// marker, no type -> always fell back to "activity", no cost/entryFee ->
// budget tracking blind to it, no from/to -> travel-leg activities broken.
const activityFields = {
  time: z.string().optional(),
  title: z.string().optional(),
  placeName: z.string().optional(),
  location: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  type: z.string().optional(),
  cost: z.number().optional(),
  entryFee: z.number().optional(),
  duration_minutes: z.number().optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
};

export const addActivitySchema = z.object({
  params: z.object({
    id: z.string().min(1, "Trip ID is required"),
  }),
  body: z.object({
    dayIndex: z.coerce.number().int().min(0),
    activity: z.object({
      ...activityFields,
      title: z.string().min(1, "Title is required"),
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
    data: z.object(activityFields).partial(),
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
