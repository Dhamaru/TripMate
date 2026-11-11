/** @vitest-environment node */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../server/index";
import { connectDB, closeDB } from "../helpers/db";
import { createUser, createTrip } from "../helpers/factories";
import { UserModel, TripModel } from "@shared/schema";
import { purgeOldGuests } from "../../server/scheduler";

describe("audit fixes: operations", () => {
  beforeAll(async () => await connectDB());
  afterAll(async () => await closeDB());

  it("removes guest accounts older than 30 days with their trips, and keeps recent ones", async () => {
    const old = new Date(Date.now() - 40 * 86400000);
    await UserModel.collection.insertMany([
      { _id: "guest_old" as any, email: "guest_old@tripmate.guest", isGuest: true, createdAt: old },
      {
        _id: "guest_new" as any,
        email: "guest_new@tripmate.guest",
        isGuest: true,
        createdAt: new Date(),
      },
    ]);
    await TripModel.create({ ...createTrip("guest_old"), userId: "guest_old" });
    expect(await purgeOldGuests()).toBe(1);
    expect(await UserModel.exists({ _id: "guest_old" })).toBeNull();
    expect(await TripModel.countDocuments({ userId: "guest_old" })).toBe(0);
    expect(await UserModel.exists({ _id: "guest_new" })).toBeTruthy();
  });

  it("returns summary fields only for the light trip list", async () => {
    const s = await request(app).post("/api/v1/auth/signup").send(createUser());
    const auth = { Authorization: `Bearer ${s.body.token}` };
    await request(app)
      .post("/api/v1/trips")
      .set(auth)
      .send(
        createTrip(s.body.user.id, {
          itinerary: [{ day: 1, activities: [{ title: "Fort" }] }],
        } as any),
      );
    const light = await request(app).get("/api/v1/trips?light=true").set(auth);
    expect(light.status).toBe(200);
    expect(light.body[0].destination).toBe("Tokyo");
    expect(light.body[0].id).toBeTruthy();
    expect(light.body[0].itinerary).toBeUndefined();
    const full = await request(app).get("/api/v1/trips").set(auth);
    expect(full.body[0].itinerary).toHaveLength(1);
  });
});
