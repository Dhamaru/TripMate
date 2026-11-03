/** @vitest-environment node */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../server/index";
import { connectDB, closeDB } from "../helpers/db";
import { createUser } from "../helpers/factories";
import { TripModel } from "@shared/schema";

// A reorder carries the whole itinerary as the client last saw it; it must
// not overwrite a change someone made after that.
describe("itinerary reorder against a stale version", () => {
  let token: string;
  let userId: string;
  beforeAll(async () => {
    await connectDB();
    const s = await request(app).post("/api/v1/auth/signup").send(createUser());
    token = s.body.token;
    userId = s.body.user.id;
  });
  afterAll(async () => await closeDB());

  it("answers 409 and keeps the newer change", async () => {
    const trip = await TripModel.create({
      userId,
      destination: "Goa",
      days: 1,
      groupSize: 1,
      itinerary: [
        {
          dayIndex: 0,
          activities: [
            { id: "a", title: "A" },
            { id: "b", title: "B" },
          ],
        },
      ],
    });
    const seen = (await TripModel.findById(trip._id).lean()) as any;
    // Someone else adds an activity after the client loaded the trip.
    await new Promise((r) => setTimeout(r, 5));
    await request(app)
      .post(`/api/v1/trips/${trip._id}/itinerary/activity`)
      .set("Authorization", `Bearer ${token}`)
      .send({ dayIndex: 0, activity: { title: "C" } });

    const res = await request(app)
      .put(`/api/v1/trips/${trip._id}/itinerary/reorder`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        itinerary: [
          {
            dayIndex: 0,
            activities: [
              { id: "b", title: "B" },
              { id: "a", title: "A" },
            ],
          },
        ],
        baseUpdatedAt: new Date(seen.updatedAt).toISOString(),
      });
    expect(res.status).toBe(409);
    const stored: any = await TripModel.findById(trip._id).lean();
    expect(stored.itinerary[0].activities.map((x: any) => x.title)).toEqual(["A", "B", "C"]);
  });

  it("saves when the version still matches", async () => {
    const trip = await TripModel.create({
      userId,
      destination: "Goa",
      days: 1,
      groupSize: 1,
      itinerary: [
        {
          dayIndex: 0,
          activities: [
            { id: "a", title: "A" },
            { id: "b", title: "B" },
          ],
        },
      ],
    });
    const seen = (await TripModel.findById(trip._id).lean()) as any;
    const res = await request(app)
      .put(`/api/v1/trips/${trip._id}/itinerary/reorder`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        itinerary: [
          {
            dayIndex: 0,
            activities: [
              { id: "b", title: "B" },
              { id: "a", title: "A" },
            ],
          },
        ],
        baseUpdatedAt: new Date(seen.updatedAt).toISOString(),
      });
    expect(res.status).toBe(200);
  });
});
