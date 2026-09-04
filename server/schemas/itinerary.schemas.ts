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

// itinerary.controller.ts's updateActivity needs its own allowlist of
// which fields it's willing to $set (Zod validation alone isn't a write
// allowlist — it just says the shape is well-formed). That allowlist
// was hand-maintained separately from this schema and silently fell out
// of sync with it the last time this field set was widened: it still
// only wrote {time, title, location, notes, latitude, longitude} while
// this schema (correctly) accepts the full set below under the renamed
// lat/lon — live-confirmed every other field (cost, type, address,
// coordinates...) was validated as well-formed, accepted with a 200, and
// then silently discarded, never written. Exporting the real key list
// here means the controller's allowlist is now structurally the same
// list as what this schema actually accepts — the two cannot drift
// apart again the way they just did.
export const ACTIVITY_FIELD_NAMES = Object.keys(activityFields) as Array<
  keyof typeof activityFields
>;

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
