/** @vitest-environment node */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { connectDB, closeDB } from "../helpers/db";
import { TripModel } from "@shared/schema";
import { backfillActivityCoords } from "../../server/controllers/trips.controller";

// Geocoding runs ~1s per activity in the background; it used to save the
// whole itinerary it read at the start, wiping edits made meanwhile.
describe("activity coordinate backfill", () => {
  beforeAll(async () => await connectDB());
  afterAll(async () => {
    vi.restoreAllMocks();
    await closeDB();
  });

  it("fills coords without overwriting an edit made while geocoding", async () => {
    const trip = await TripModel.create({
      userId: "u1",
      destination: "Goa",
      groupSize: 1,
      days: 2,
      startDate: new Date(),
      endDate: new Date(),
      itinerary: [
        { dayIndex: 0, activities: [{ id: "a1", title: "Fort", location: "Aguada Fort" }] },
        { dayIndex: 1 },
      ],
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      // A user adds an activity while the geocode request is in flight.
      await TripModel.updateOne(
        { _id: trip._id },
        { $push: { "itinerary.0.activities": { id: "a2", title: "Beach", lat: 1, lon: 2 } } },
      );
      return new Response(JSON.stringify([{ lat: "15.49", lon: "73.77" }]));
    });

    await backfillActivityCoords(String(trip._id), "Goa");

    const after = await TripModel.findById(trip._id).lean();
    const acts = (after as any).itinerary[0].activities;
    expect(acts.map((a: any) => a.id)).toEqual(["a1", "a2"]);
    expect(acts[0]).toMatchObject({ lat: 15.49, lon: 73.77 });
    expect(acts[1]).toMatchObject({ lat: 1, lon: 2 });
    expect((after as any).coordsBackfillAttempted).toBe(true);
  });
});
