/** @vitest-environment node */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../server/index";
import { connectDB, closeDB } from "../helpers/db";
import { createUser, createTrip } from "../helpers/factories";
import { TripModel } from "@shared/schema";

describe("adding a collaborator", () => {
  beforeAll(async () => await connectDB());
  afterAll(async () => await closeDB());

  it("adds them once even when two invites race", async () => {
    const owner = await request(app).post("/api/v1/auth/signup").send(createUser());
    const friend = createUser();
    await request(app).post("/api/v1/auth/signup").send(friend);
    const trip = await request(app)
      .post("/api/v1/trips")
      .set("Authorization", `Bearer ${owner.body.token}`)
      .send(createTrip(owner.body.user.id));
    const invite = () =>
      request(app)
        .post(`/api/v1/trips/${trip.body.id}/collaborators`)
        .set("Authorization", `Bearer ${owner.body.token}`)
        .send({ email: friend.email, role: "editor" });
    const results = await Promise.all([invite(), invite(), invite()]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    const stored: any = await TripModel.findById(trip.body.id).lean();
    expect(stored.collaborators).toHaveLength(1);
  });
});
