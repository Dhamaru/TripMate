/** @vitest-environment node */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import request from "supertest";
import { app } from "../../server/index";
import { connectDB, closeDB } from "../helpers/db";
import { createUser } from "../helpers/factories";
import { TripModel } from "@shared/schema";

// Opening a trip repairs legacy itineraries (missing activity ids / dayIndex).
// It used to save the whole document, which could undo an edit made in between.
describe("getTrip self-heal", () => {
  let token: string;
  let userId: string;

  beforeAll(async () => {
    await connectDB();
    const res = await request(app).post("/api/v1/auth/signup").send(createUser());
    token = res.body.token;
    userId = res.body.user.id;
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => await closeDB());

  const legacyTrip = () =>
    TripModel.create({
      userId,
      destination: "Goa",
      days: 2,
      groupSize: 1,
      itinerary: [
        { day: 1, activities: [{ title: "Fort" }] },
        { day: 2, activities: [] },
      ],
    });

  it("persists ids and dayIndex for a legacy itinerary", async () => {
    const trip = await legacyTrip();
    const res = await request(app)
      .get(`/api/v1/trips/${trip._id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const stored: any = await TripModel.findById(trip._id).lean();
    expect(stored.itinerary.map((d: any) => d.dayIndex)).toEqual([0, 1]);
    expect(stored.itinerary[0].activities[0].id).toBeTruthy();
  });

  it("doesn't undo an itinerary edit made while the trip was loading", async () => {
    const trip = await legacyTrip();
    const realUpdateOne = TripModel.updateOne.bind(TripModel);
    let raced = false;
    vi.spyOn(TripModel, "updateOne").mockImplementation(((filter: any, update: any, opts: any) => {
      if (!raced && filter?.itinerary) {
        raced = true;
        // Another collaborator adds an activity between the read and the heal.
        return realUpdateOne(
          { _id: trip._id },
          { $push: { "itinerary.1.activities": { id: "new", title: "Beach" } } },
        ).then(() => realUpdateOne(filter, update, opts));
      }
      return realUpdateOne(filter, update, opts);
    }) as any);

    await request(app).get(`/api/v1/trips/${trip._id}`).set("Authorization", `Bearer ${token}`);
    const stored: any = await TripModel.findById(trip._id).lean();
    expect(raced).toBe(true);
    expect(stored.itinerary[1].activities.map((a: any) => a.title)).toEqual(["Beach"]);
  });
});
