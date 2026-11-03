/** @vitest-environment node */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../server/index";
import { connectDB, closeDB } from "../helpers/db";
import { createUser } from "../helpers/factories";
import { TripModel } from "@shared/schema";

// dayIndex must always equal the day's position in the array.
describe("itinerary day positions", () => {
  let token: string;
  let userId: string;
  beforeAll(async () => {
    await connectDB();
    const s = await request(app).post("/api/v1/auth/signup").send(createUser());
    token = s.body.token;
    userId = s.body.user.id;
  });
  afterAll(async () => await closeDB());
  const auth = (r: request.Test) => r.set("Authorization", `Bearer ${token}`);

  it("adding to a day past the end fills the gap with empty days", async () => {
    const trip = await TripModel.create({
      userId,
      destination: "Goa",
      days: 4,
      groupSize: 1,
      itinerary: [{ dayIndex: 0, activities: [] }],
    });
    const res = await auth(request(app).post(`/api/v1/trips/${trip._id}/itinerary/activity`)).send({
      dayIndex: 3,
      activity: { title: "Beach", time: "10:00 AM" },
    });
    expect(res.status).toBeLessThan(300);
    const stored: any = await TripModel.findById(trip._id).lean();
    expect(stored.itinerary.map((d: any) => d.dayIndex)).toEqual([0, 1, 2, 3]);
    expect(stored.itinerary[3].activities[0].title).toBe("Beach");
  });

  it("trimming works on older trips saved without dayIndex", async () => {
    const trip = await TripModel.create({
      userId,
      destination: "Goa",
      days: 3,
      groupSize: 1,
      itinerary: [
        { day: 1, activities: [] },
        { day: 2, activities: [] },
        { day: 3, activities: [] },
      ],
    });
    const res = await auth(request(app).put(`/api/v1/trips/${trip._id}/itinerary/trim`)).send({
      days: 1,
    });
    expect(res.status).toBe(200);
    const stored: any = await TripModel.findById(trip._id).lean();
    expect(stored.itinerary).toHaveLength(1);
  });

  it("delete needs a valid dayIndex", async () => {
    const trip = await TripModel.create({
      userId,
      destination: "Goa",
      days: 1,
      groupSize: 1,
      itinerary: [{ dayIndex: 0, activities: [{ id: "a1", title: "x" }] }],
    });
    const bad = await auth(
      request(app).delete(`/api/v1/trips/${trip._id}/itinerary/activity/a1`),
    ).send({ dayIndex: "nope" });
    expect(bad.status).toBe(400);
  });
});
