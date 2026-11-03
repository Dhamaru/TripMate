import { z } from "zod";

const lat = z.coerce.number().min(-90).max(90);
const lng = z.coerce.number().min(-180).max(180);

// Out-of-range coordinates (e.g. 999) used to be stored and poisoned the
// shared crowd heatmap.
export const crowdReportSchema = z.object({
  body: z.object({
    latitude: lat,
    longitude: lng,
    density: z.coerce.number().int().min(1).max(10),
    placeId: z.string().max(200).optional(),
  }),
});

export const createMapPinSchema = z.object({
  body: z.object({
    lat,
    lng,
    name: z.string().trim().min(1).max(200),
    note: z.string().max(2000).optional(),
    color: z.string().max(32),
  }),
});
