/** @vitest-environment node */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import { app } from "../../server/index";
import { connectDB, closeDB, clearDB } from "../helpers/db";
import { createUser, createTrip } from "../helpers/factories";

describe("Trips API", () => {
  let token: string;
  let userId: string;

  beforeAll(async () => {
    await connectDB();
  });
  afterAll(async () => await closeDB());

  beforeEach(async () => {
    await clearDB();
    const userData = createUser();
    const signupRes = await request(app).post("/api/v1/auth/signup").send(userData);
    token = signupRes.body.token;
    userId = signupRes.body.user.id;
  });

  it("should create a new trip", async () => {
    const tripData = {
      destination: "Kyoto",
      origin: "Delhi",
      startDate: "2025-07-01",
      endDate: "2025-07-05",
      days: 4,
      groupSize: 2,
      travelStyle: "cultural",
      budget: 2000,
      currency: "USD",
    };

    const res = await request(app)
      .post("/api/v1/trips")
      .set("Authorization", `Bearer ${token}`)
      .send(tripData);

    expect(res.status).toBe(201);
    expect(res.body.destination).toBe("Kyoto");
    expect(res.body.userId).toBe(userId);
  });

  it("should fetch user trips", async () => {
    const tripData = createTrip(userId, { destination: "Sapporo" });
    const res_create = await request(app)
      .post("/api/v1/trips")
      .set("Authorization", `Bearer ${token}`)
      .send(tripData);

    const res = await request(app).get("/api/v1/trips").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].destination).toBe("Sapporo");
  });

  it("should generate itinerary for a trip", async () => {
    // Note: /generate-itinerary is a standalone endpoint (not tied to an
    // existing trip id) that plans a trip from raw params before it's saved.
    // This hits real AI/geocoding providers, so give it more than the 5s default.
    const res = await request(app)
      .post("/api/v1/trips/generate-itinerary")
      .set("Authorization", `Bearer ${token}`)
      .send({ destination: "Osaka", days: 3, persons: 2, budget: 1000, currency: "USD" });

    expect(res.status).toBe(200);
    expect(res.body.itinerary).toBeDefined();
    expect(Array.isArray(res.body.itinerary)).toBe(true);
  }, 30000);

  it("self-heals a legacy day-only itinerary (no dayIndex field) on GET, so addActivity lands on the real day instead of creating a phantom one", async () => {
    // Reproduces a live-reported bug: AiUtilitiesService.planTrip/
    // generateFallbackTrip (and any older trip) only ever stamp a 1-based
    // `day` field on each itinerary day, never `dayIndex`. Every client
    // mutation (ItineraryManager.tsx's "+ Add Activity", Places-tab
    // "Add to Itinerary") sends `dayIndex` as the 0-based ARRAY POSITION,
    // but addActivity's fast path matches against a `dayIndex` FIELD on
    // the day sub-document. With no such field, it silently pushed a
    // brand-new phantom day instead of adding to the one the user clicked
    // — no error, just "Activity added" and the activity nowhere the
    // user expected. trips.controller.ts's getTrip now self-heals this
    // the same way it already does for missing activity ids/coords.
    const trip = await request(app)
      .post("/api/v1/trips")
      .set("Authorization", `Bearer ${token}`)
      .send(
        createTrip(userId, {
          itinerary: [
            { day: 1, activities: [{ id: "a1", title: "Existing Day 1 Activity" }] },
            { day: 2, activities: [{ id: "a2", title: "Existing Day 2 Activity" }] },
          ],
        } as any),
      );
    expect(trip.status).toBe(201);
    const tripId = trip.body.id;

    // Viewing the trip is what triggers the self-heal (same trigger point
    // as the id/coords self-heal above it) — this is also exactly what
    // TripDetail.tsx's fetchTrip does before any "+ Add Activity" click
    // is even possible in the real UI.
    const getRes = await request(app)
      .get(`/api/v1/trips/${tripId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.itinerary[0].dayIndex).toBe(0);
    expect(getRes.body.itinerary[1].dayIndex).toBe(1);

    // The actual regression: adding to day 0 (array position, matching
    // what the real UI sends) must land on the existing Day 1 — not
    // create a third, phantom day.
    const addRes = await request(app)
      .post(`/api/v1/trips/${tripId}/itinerary/activity`)
      .set("Authorization", `Bearer ${token}`)
      .send({ dayIndex: 0, activity: { title: "New Activity" } });
    expect(addRes.status).toBe(201);
    expect(addRes.body.itinerary.length, "no phantom day created").toBe(2);
    expect(addRes.body.itinerary[0].activities.map((a: any) => a.title)).toEqual([
      "Existing Day 1 Activity",
      "New Activity",
    ]);
    expect(addRes.body.itinerary[1].activities.map((a: any) => a.title)).toEqual([
      "Existing Day 2 Activity",
    ]);
  });

  it("should delete a trip", async () => {
    const trip = await request(app)
      .post("/api/v1/trips")
      .set("Authorization", `Bearer ${token}`)
      .send(createTrip(userId));

    const res = await request(app)
      .delete(`/api/v1/trips/${trip.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(204);

    const getRes = await request(app).get("/api/v1/trips").set("Authorization", `Bearer ${token}`);
    expect(getRes.body.find((t: any) => t.id === trip.body.id)).toBeUndefined();
  });
});
